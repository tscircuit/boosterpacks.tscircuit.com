import { asString, byType, sanitizeField } from "./format"
import { TraceConnectivity } from "./trace-connectivity"
import type {
  CircuitElement,
  PcbNetName,
  SourceNetId,
  SourcePortId,
  SourceTraceId,
} from "./types"

export type PcbNetEntry = {
  index: number
  name: PcbNetName
  sourcePortIds: SourcePortId[]
  traceIds: SourceTraceId[]
}

export const createPcbNetEntries = (
  circuitJson: CircuitElement[],
): PcbNetEntry[] => {
  const sourceNets = new Map<SourceNetId, PcbNetName>(
    byType(circuitJson, "source_net").map((net) => [
      asString(net.source_net_id),
      sanitizeField(net.name) || asString(net.source_net_id),
    ]),
  )
  const sourceTraces = byType(circuitJson, "source_trace")
  const traceConnectivity = new TraceConnectivity(sourceTraces.length)
  const firstTraceBySourcePortId = new Map<SourcePortId, number>()
  const firstTraceBySourceNetId = new Map<SourceNetId, number>()
  for (const [traceIndex, trace] of sourceTraces.entries()) {
    const sourcePortIds = Array.isArray(trace.connected_source_port_ids)
      ? trace.connected_source_port_ids.map((sourcePortId) =>
          asString(sourcePortId),
        )
      : []
    const sourceNetIds = Array.isArray(trace.connected_source_net_ids)
      ? trace.connected_source_net_ids.map((sourceNetId) =>
          asString(sourceNetId),
        )
      : []
    for (const [connectionId, firstTraceByConnectionId] of [
      ...sourcePortIds.map(
        (sourcePortId) => [sourcePortId, firstTraceBySourcePortId] as const,
      ),
      ...sourceNetIds.map(
        (sourceNetId) => [sourceNetId, firstTraceBySourceNetId] as const,
      ),
    ]) {
      if (!connectionId) continue
      const firstTraceIndex = firstTraceByConnectionId.get(connectionId)
      if (firstTraceIndex === undefined) {
        firstTraceByConnectionId.set(connectionId, traceIndex)
      } else {
        traceConnectivity.connect(firstTraceIndex, traceIndex)
      }
    }
  }

  const traceIndexesByRoot = new Map<number, number[]>()
  for (const traceIndex of sourceTraces.keys()) {
    const rootTraceIndex = traceConnectivity.getRoot(traceIndex)
    traceIndexesByRoot.set(rootTraceIndex, [
      ...(traceIndexesByRoot.get(rootTraceIndex) ?? []),
      traceIndex,
    ])
  }
  const useCountByPcbNetName = new Map<PcbNetName, number>()
  return [...traceIndexesByRoot.values()].map((traceIndexes, index) => {
    const traces = traceIndexes.map(
      (traceIndex) => sourceTraces[traceIndex] as CircuitElement,
    )
    const sourceNetIds = [
      ...new Set(
        traces.flatMap((trace) =>
          Array.isArray(trace.connected_source_net_ids)
            ? trace.connected_source_net_ids
                .map((sourceNetId) => asString(sourceNetId))
                .filter(Boolean)
            : [],
        ),
      ),
    ]
    const sourcePortIds = [
      ...new Set(
        traces.flatMap((trace) =>
          Array.isArray(trace.connected_source_port_ids)
            ? trace.connected_source_port_ids
                .map((sourcePortId) => asString(sourcePortId))
                .filter(Boolean)
            : [],
        ),
      ),
    ]
    const basePcbNetName =
      sourceNetIds.map((id) => sourceNets.get(id)).find(Boolean) ||
      traces
        .map(
          (trace) =>
            sanitizeField(trace.name) || sanitizeField(trace.display_name),
        )
        .find(Boolean) ||
      `Net-${index + 1}`
    const pcbNetNameUseCount =
      (useCountByPcbNetName.get(basePcbNetName) ?? 0) + 1
    useCountByPcbNetName.set(basePcbNetName, pcbNetNameUseCount)
    return {
      index,
      name:
        pcbNetNameUseCount === 1
          ? basePcbNetName
          : `${basePcbNetName}-${pcbNetNameUseCount}`,
      sourcePortIds,
      traceIds: traces.map(
        (trace, traceOffset) =>
          asString(trace.source_trace_id) ||
          `source_trace_${traceIndexes[traceOffset]}`,
      ),
    }
  })
}
