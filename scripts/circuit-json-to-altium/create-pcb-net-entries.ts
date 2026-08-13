import { asString, byType, sanitizeField } from "./format"
import type { CircuitElement } from "./types"

export type PcbNetEntry = {
  index: number
  name: string
  sourcePortIds: string[]
  traceIds: string[]
}

export const createPcbNetEntries = (
  circuitJson: CircuitElement[],
): PcbNetEntry[] => {
  const sourceNets = new Map(
    byType(circuitJson, "source_net").map((net) => [
      asString(net.source_net_id),
      sanitizeField(net.name) || asString(net.source_net_id),
    ]),
  )
  const sourceTraces = byType(circuitJson, "source_trace")
  const parents = sourceTraces.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while (parents[root] !== root) root = parents[root] as number
    while (parents[index] !== index) {
      const next = parents[index] as number
      parents[index] = root
      index = next
    }
    return root
  }
  const union = (left: number, right: number) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot === rightRoot) return
    const root = Math.min(leftRoot, rightRoot)
    parents[leftRoot] = root
    parents[rightRoot] = root
  }
  const firstTraceByPort = new Map<string, number>()
  const firstTraceByNet = new Map<string, number>()
  for (const [traceIndex, trace] of sourceTraces.entries()) {
    const portIds = Array.isArray(trace.connected_source_port_ids)
      ? trace.connected_source_port_ids.map((value) => asString(value))
      : []
    const netIds = Array.isArray(trace.connected_source_net_ids)
      ? trace.connected_source_net_ids.map((value) => asString(value))
      : []
    for (const [id, firstById] of [
      ...portIds.map((id) => [id, firstTraceByPort] as const),
      ...netIds.map((id) => [id, firstTraceByNet] as const),
    ]) {
      if (!id) continue
      const firstTrace = firstById.get(id)
      if (firstTrace === undefined) firstById.set(id, traceIndex)
      else union(firstTrace, traceIndex)
    }
  }

  const traceIndexesByRoot = new Map<number, number[]>()
  for (const traceIndex of sourceTraces.keys()) {
    const root = find(traceIndex)
    traceIndexesByRoot.set(root, [
      ...(traceIndexesByRoot.get(root) ?? []),
      traceIndex,
    ])
  }
  const usedNames = new Map<string, number>()
  return [...traceIndexesByRoot.values()].map((traceIndexes, index) => {
    const traces = traceIndexes.map(
      (traceIndex) => sourceTraces[traceIndex] as CircuitElement,
    )
    const sourceNetIds = [
      ...new Set(
        traces.flatMap((trace) =>
          Array.isArray(trace.connected_source_net_ids)
            ? trace.connected_source_net_ids
                .map((value) => asString(value))
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
                .map((value) => asString(value))
                .filter(Boolean)
            : [],
        ),
      ),
    ]
    const baseName =
      sourceNetIds.map((id) => sourceNets.get(id)).find(Boolean) ||
      traces
        .map(
          (trace) =>
            sanitizeField(trace.name) || sanitizeField(trace.display_name),
        )
        .find(Boolean) ||
      `Net-${index + 1}`
    const nameCount = (usedNames.get(baseName) ?? 0) + 1
    usedNames.set(baseName, nameCount)
    return {
      index,
      name: nameCount === 1 ? baseName : `${baseName}-${nameCount}`,
      sourcePortIds,
      traceIds: traces.map(
        (trace, traceOffset) =>
          asString(trace.source_trace_id) ||
          `source_trace_${traceIndexes[traceOffset]}`,
      ),
    }
  })
}
