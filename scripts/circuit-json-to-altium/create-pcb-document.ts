import {
  MILLIMETERS_TO_MILS,
  asNumber,
  asPoint,
  asPositiveNumber,
  asString,
  byType,
  formatMil,
  formatNumber,
  pointsEqual,
  sanitizeField,
} from "./format"
import { getBoardOutline } from "./get-board-outline"
import { createPcbNetEntries } from "./create-pcb-net-entries"
import type { CircuitElement, Point } from "./types"

export const createPcbDocument = (circuitJson: CircuitElement[]) => {
  const board = byType(circuitJson, "pcb_board")[0]
  const outline = getBoardOutline(board)
  const minX = Math.min(...outline.map((point) => point.x))
  const minY = Math.min(...outline.map((point) => point.y))
  const transform = (point: Point) => ({
    x: (point.x - minX) * MILLIMETERS_TO_MILS + 1_000,
    y: (point.y - minY) * MILLIMETERS_TO_MILS + 1_000,
  })
  const closedOutline = [...outline, outline[0] as Point]
  const boardFields = closedOutline.flatMap((point, index) => {
    const transformed = transform(point)
    return [
      `KIND${index}=0`,
      `VX${index}=${formatMil(transformed.x)}`,
      `VY${index}=${formatMil(transformed.y)}`,
    ]
  })
  const lines = [
    [
      "|RECORD=Board",
      "KIND=Protel_Advanced_PCB",
      "VERSION=5.00",
      ...boardFields,
    ].join("|"),
  ]

  const sourceComponents = new Map(
    byType(circuitJson, "source_component")
      .filter((element) => typeof element.source_component_id === "string")
      .map((element) => [asString(element.source_component_id), element]),
  )
  const sourcePorts = new Map(
    byType(circuitJson, "source_port").map((port) => [
      asString(port.source_port_id),
      port,
    ]),
  )
  const pcbPorts = new Map(
    byType(circuitJson, "pcb_port").map((port) => [
      asString(port.pcb_port_id),
      port,
    ]),
  )
  const netEntries = createPcbNetEntries(circuitJson)
  const netByTraceId = new Map(
    netEntries.flatMap((net) =>
      net.traceIds.map((traceId) => [traceId, net] as const),
    ),
  )
  const netBySourcePortId = new Map(
    netEntries.flatMap((net) =>
      net.sourcePortIds.map((sourcePortId) => [sourcePortId, net] as const),
    ),
  )

  for (const net of netEntries) {
    lines.push(
      `|RECORD=Net|ID=${net.index}|NAME=${sanitizeField(net.name)}|VISIBLE=FALSE|JUMPERSVISIBLE=FALSE`,
    )
  }

  const pcbComponents = byType(circuitJson, "pcb_component")
  const componentIndex = new Map<string, number>()
  for (const [index, component] of pcbComponents.entries()) {
    const componentId =
      asString(component.pcb_component_id) || `pcb_component_${index}`
    componentIndex.set(componentId, index)
    const sourceComponent = sourceComponents.get(
      asString(component.source_component_id),
    )
    const center = transform(asPoint(component.center) ?? { x: 0, y: 0 })
    const designator =
      sanitizeField(sourceComponent?.name) || `Component-${index + 1}`
    const pattern = `TSCIRCUIT-${formatNumber(asPositiveNumber(component.width, 1))}x${formatNumber(asPositiveNumber(component.height, 1))}mm`
    const layer =
      asString(component.layer).toLowerCase() === "bottom" ? "BOTTOM" : "TOP"
    lines.push(
      [
        "|RECORD=Component",
        `ID=${index}`,
        `LAYER=${layer}`,
        `X=${formatMil(center.x)}`,
        `Y=${formatMil(center.y)}`,
        `ROTATION=${formatNumber(asNumber(component.rotation))}`,
        `PATTERN=${pattern}`,
        `SOURCEDESIGNATOR=${designator}`,
        "NAMEON=TRUE",
        "COMMENTON=TRUE",
        `SOURCEUNIQUEID=${sanitizeField(componentId)}`,
      ].join("|"),
    )
  }

  const getPadNet = (pad: CircuitElement) => {
    const pcbPort = pcbPorts.get(asString(pad.pcb_port_id))
    return netBySourcePortId.get(asString(pcbPort?.source_port_id))
  }
  const getPadName = (pad: CircuitElement) => {
    const pcbPort = pcbPorts.get(asString(pad.pcb_port_id))
    const sourcePort = sourcePorts.get(asString(pcbPort?.source_port_id))
    return (
      sanitizeField(sourcePort?.pin_number?.toString()) ||
      sanitizeField(sourcePort?.name) ||
      "1"
    )
  }

  for (const pad of byType(circuitJson, "pcb_smtpad")) {
    const center = transform({ x: asNumber(pad.x), y: asNumber(pad.y) })
    const component = componentIndex.get(asString(pad.pcb_component_id))
    const net = getPadNet(pad)
    const diameter = asPositiveNumber(pad.radius, 0.5) * 2
    const width = asPositiveNumber(pad.width, diameter)
    const height = asPositiveNumber(pad.height, width)
    const shape = pad.shape === "circle" ? "ROUND" : "RECTANGLE"
    const layer =
      asString(pad.layer).toLowerCase() === "bottom" ? "BOTTOM" : "TOP"
    lines.push(
      [
        "|RECORD=Pad",
        ...(component === undefined ? [] : [`COMPONENT=${component}`]),
        ...(net ? [`NET=${net.index}`] : []),
        `LAYER=${layer}`,
        `ROTATION=${formatNumber(asNumber(pad.ccw_rotation))}`,
        `NAME=${getPadName(pad)}`,
        "HOLESIZE=0mil",
        "PLATED=TRUE",
        "LOCKED=FALSE",
        `X=${formatMil(center.x)}`,
        `Y=${formatMil(center.y)}`,
        `SHAPE=${shape}`,
        `XSIZE=${formatMil(width * MILLIMETERS_TO_MILS)}`,
        `YSIZE=${formatMil(height * MILLIMETERS_TO_MILS)}`,
      ].join("|"),
    )
  }

  for (const hole of byType(circuitJson, "pcb_plated_hole")) {
    const center = transform({ x: asNumber(hole.x), y: asNumber(hole.y) })
    const component = componentIndex.get(asString(hole.pcb_component_id))
    const net = getPadNet(hole)
    const outerWidth = asPositiveNumber(
      hole.outer_width,
      asPositiveNumber(hole.outer_diameter, 1.6),
    )
    const outerHeight = asPositiveNumber(hole.outer_height, outerWidth)
    const holeWidth = asPositiveNumber(
      hole.hole_width,
      asPositiveNumber(hole.hole_diameter, 0.8),
    )
    const holeHeight = asPositiveNumber(hole.hole_height, holeWidth)
    const isSlotted = Math.abs(holeWidth - holeHeight) > 1e-9
    lines.push(
      [
        "|RECORD=Pad",
        ...(component === undefined ? [] : [`COMPONENT=${component}`]),
        ...(net ? [`NET=${net.index}`] : []),
        "LAYER=MULTILAYER",
        `ROTATION=${formatNumber(asNumber(hole.ccw_rotation))}`,
        `NAME=${getPadName(hole)}`,
        `HOLESIZE=${formatMil(Math.min(holeWidth, holeHeight) * MILLIMETERS_TO_MILS)}`,
        `HOLEWIDTH=${formatMil(Math.max(holeWidth, holeHeight) * MILLIMETERS_TO_MILS)}`,
        `HOLESHAPE=${isSlotted ? "SLOT" : "ROUND"}`,
        `HOLEROTATION=${formatNumber(asNumber(hole.ccw_rotation))}`,
        "PLATED=TRUE",
        "LOCKED=FALSE",
        `X=${formatMil(center.x)}`,
        `Y=${formatMil(center.y)}`,
        `SHAPE=${hole.shape === "circle" ? "ROUND" : "RECTANGLE"}`,
        `XSIZE=${formatMil(outerWidth * MILLIMETERS_TO_MILS)}`,
        `YSIZE=${formatMil(outerHeight * MILLIMETERS_TO_MILS)}`,
      ].join("|"),
    )
  }

  for (const [holeIndex, hole] of byType(circuitJson, "pcb_hole").entries()) {
    const center = transform({ x: asNumber(hole.x), y: asNumber(hole.y) })
    const component = componentIndex.get(asString(hole.pcb_component_id))
    const diameter = asPositiveNumber(hole.hole_diameter, 1)
    const holeWidth = asPositiveNumber(hole.hole_width, diameter)
    const holeHeight = asPositiveNumber(hole.hole_height, diameter)
    const isSlotted = Math.abs(holeWidth - holeHeight) > 1e-9
    lines.push(
      [
        "|RECORD=Pad",
        ...(component === undefined ? [] : [`COMPONENT=${component}`]),
        "LAYER=MULTILAYER",
        `ROTATION=${formatNumber(asNumber(hole.ccw_rotation))}`,
        `NAME=NPTH-${holeIndex + 1}`,
        `HOLESIZE=${formatMil(Math.min(holeWidth, holeHeight) * MILLIMETERS_TO_MILS)}`,
        `HOLEWIDTH=${formatMil(Math.max(holeWidth, holeHeight) * MILLIMETERS_TO_MILS)}`,
        `HOLESHAPE=${isSlotted ? "SLOT" : "ROUND"}`,
        `HOLEROTATION=${formatNumber(asNumber(hole.ccw_rotation))}`,
        "PLATED=FALSE",
        "LOCKED=FALSE",
        `X=${formatMil(center.x)}`,
        `Y=${formatMil(center.y)}`,
        `SHAPE=${isSlotted ? "RECTANGLE" : "ROUND"}`,
        `XSIZE=${formatMil(holeWidth * MILLIMETERS_TO_MILS)}`,
        `YSIZE=${formatMil(holeHeight * MILLIMETERS_TO_MILS)}`,
      ].join("|"),
    )
  }

  for (const trace of byType(circuitJson, "pcb_trace")) {
    const route = Array.isArray(trace.route)
      ? (trace.route as CircuitElement[]).filter(
          (point) => asPoint(point) !== undefined,
        )
      : []
    const net = netByTraceId.get(asString(trace.source_trace_id))
    for (let index = 1; index < route.length; index++) {
      const start = route[index - 1] as CircuitElement
      const end = route[index] as CircuitElement
      if (start.route_type === "via" && end.route_type === "via") continue
      const startPoint = transform({
        x: asNumber(start.x),
        y: asNumber(start.y),
      })
      const endPoint = transform({ x: asNumber(end.x), y: asNumber(end.y) })
      if (pointsEqual(startPoint, endPoint)) continue
      const routeLayer =
        asString(end.layer, asString(start.layer)).toLowerCase() === "bottom"
          ? "BOTTOM"
          : "TOP"
      lines.push(
        [
          "|RECORD=Track",
          ...(net ? [`NET=${net.index}`] : []),
          `LAYER=${routeLayer}`,
          "LOCKED=FALSE",
          `X1=${formatMil(startPoint.x)}`,
          `Y1=${formatMil(startPoint.y)}`,
          `X2=${formatMil(endPoint.x)}`,
          `Y2=${formatMil(endPoint.y)}`,
          `WIDTH=${formatMil(asPositiveNumber(end.width, asPositiveNumber(start.width, 0.2)) * MILLIMETERS_TO_MILS)}`,
        ].join("|"),
      )
    }
  }

  const pcbTraces = new Map(
    byType(circuitJson, "pcb_trace").map((trace) => [
      asString(trace.pcb_trace_id),
      trace,
    ]),
  )
  for (const via of byType(circuitJson, "pcb_via")) {
    const center = transform({ x: asNumber(via.x), y: asNumber(via.y) })
    const owningTrace = pcbTraces.get(asString(via.pcb_trace_id))
    const net = netByTraceId.get(
      asString(via.source_trace_id, asString(owningTrace?.source_trace_id)),
    )
    lines.push(
      [
        "|RECORD=Via",
        ...(net ? [`NET=${net.index}`] : []),
        `X=${formatMil(center.x)}`,
        `Y=${formatMil(center.y)}`,
        `DIAMETER=${formatMil(asPositiveNumber(via.outer_diameter, 0.6) * MILLIMETERS_TO_MILS)}`,
        `HOLESIZE=${formatMil(asPositiveNumber(via.hole_diameter, 0.3) * MILLIMETERS_TO_MILS)}`,
        "STARTLAYER=TOP",
        "STOPLAYER=BOTTOM",
        "LOCKED=FALSE",
      ].join("|"),
    )
  }

  for (const path of byType(circuitJson, "pcb_silkscreen_path")) {
    const route = Array.isArray(path.route)
      ? (path.route as CircuitElement[]).filter(
          (point) => asPoint(point) !== undefined,
        )
      : []
    const component = componentIndex.get(asString(path.pcb_component_id))
    const layer =
      asString(path.layer).toLowerCase() === "bottom"
        ? "BOTTOMOVERLAY"
        : "TOPOVERLAY"
    for (let index = 1; index < route.length; index++) {
      const start = transform(asPoint(route[index - 1]) as Point)
      const end = transform(asPoint(route[index]) as Point)
      if (pointsEqual(start, end)) continue
      lines.push(
        [
          "|RECORD=Track",
          ...(component === undefined ? [] : [`COMPONENT=${component}`]),
          `LAYER=${layer}`,
          "LOCKED=FALSE",
          `X1=${formatMil(start.x)}`,
          `Y1=${formatMil(start.y)}`,
          `X2=${formatMil(end.x)}`,
          `Y2=${formatMil(end.y)}`,
          `WIDTH=${formatMil(asPositiveNumber(path.stroke_width, 0.15) * MILLIMETERS_TO_MILS)}`,
        ].join("|"),
      )
    }
  }

  for (const silkText of byType(circuitJson, "pcb_silkscreen_text")) {
    const anchor =
      asPoint(silkText.anchor_position) ??
      asPoint(silkText.center) ??
      ({ x: 0, y: 0 } satisfies Point)
    const position = transform(anchor)
    const component = componentIndex.get(asString(silkText.pcb_component_id))
    const isBottom = asString(silkText.layer).toLowerCase() === "bottom"
    const fontSize = asPositiveNumber(silkText.font_size, 1)
    lines.push(
      [
        "|RECORD=Text",
        ...(component === undefined ? [] : [`COMPONENT=${component}`]),
        `LAYER=${isBottom ? "BOTTOMOVERLAY" : "TOPOVERLAY"}`,
        `X=${formatMil(position.x)}`,
        `Y=${formatMil(position.y)}`,
        `ROTATION=${formatNumber(asNumber(silkText.ccw_rotation))}`,
        `MIRROR=${isBottom ? "TRUE" : "FALSE"}`,
        `HEIGHT=${formatMil(fontSize * MILLIMETERS_TO_MILS)}`,
        `WIDTH=${formatMil(Math.max(0.05, fontSize * 0.1) * MILLIMETERS_TO_MILS)}`,
        "USETTFONTS=TRUE",
        "FONTNAME=Arial",
        "JUSTIFICATION=4",
        `TEXT=${sanitizeField(silkText.text)}`,
      ].join("|"),
    )
  }

  return `${lines.join("\r\n")}\r\n`
}
