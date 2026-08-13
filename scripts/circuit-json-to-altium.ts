import {
  parseAltiumPcbDoc,
  parseAltiumPrjPcb,
  parseAltiumSchDoc,
} from "altiumts"
import JSZip from "jszip"

type CircuitElement = Record<string, unknown> & { type?: string }
type Point = { x: number; y: number }

const MILLIMETERS_TO_MILS = 39.3700787402
const DEFAULT_BOARD_WIDTH_MM = 100
const DEFAULT_BOARD_HEIGHT_MM = 80

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const asPositiveNumber = (value: unknown, fallback: number) => {
  const number = asNumber(value, fallback)
  return number > 0 ? number : fallback
}

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback

const asPoint = (value: unknown): Point | undefined => {
  if (!value || typeof value !== "object") return undefined
  const point = value as Record<string, unknown>
  if (
    typeof point.x !== "number" ||
    !Number.isFinite(point.x) ||
    typeof point.y !== "number" ||
    !Number.isFinite(point.y)
  ) {
    return undefined
  }
  return { x: point.x, y: point.y }
}

const sanitizeField = (value: unknown) => {
  const rawValue =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : asString(value)
  return [...rawValue]
    .map((character) => {
      const characterCode = character.charCodeAt(0)
      return character === "|" || characterCode < 32 || characterCode === 127
        ? " "
        : character
    })
    .join("")
    .trim()
}

const sanitizeFilename = (value: string) => {
  const sanitized = value
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^[.-]+|[.-]+$/gu, "")
    .slice(0, 80)
  if (!sanitized) return "board"
  if (/^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])$/iu.test(sanitized)) {
    return `board-${sanitized}`
  }
  return sanitized
}

const formatNumber = (value: number) => {
  const rounded = Math.round(value * 10_000) / 10_000
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(4)
}

const formatMil = (value: number) => `${formatNumber(value)}mil`

const byType = (circuitJson: CircuitElement[], type: string) =>
  circuitJson.filter((element) => element.type === type)

const pointsEqual = (left: Point, right: Point) =>
  Math.abs(left.x - right.x) < 1e-9 && Math.abs(left.y - right.y) < 1e-9

const getPolygonArea = (points: Point[]) =>
  Math.abs(
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length] as Point
      return area + point.x * next.y - next.x * point.y
    }, 0) / 2,
  )

const getBoardOutline = (board: CircuitElement | undefined): Point[] => {
  const parsedOutline = Array.isArray(board?.outline)
    ? board.outline.map(asPoint)
    : []
  const explicitOutline = parsedOutline.filter((point): point is Point =>
    Boolean(point),
  )
  const hasOnlyValidOutlinePoints =
    explicitOutline.length === parsedOutline.length
  if (
    explicitOutline.length > 1 &&
    pointsEqual(explicitOutline[0] as Point, explicitOutline.at(-1) as Point)
  ) {
    explicitOutline.pop()
  }

  if (
    hasOnlyValidOutlinePoints &&
    explicitOutline.length >= 3 &&
    getPolygonArea(explicitOutline) > 1e-9
  ) {
    return explicitOutline
  }

  const center = asPoint(board?.center) ?? { x: 0, y: 0 }
  const width = asPositiveNumber(board?.width, DEFAULT_BOARD_WIDTH_MM)
  const height = asPositiveNumber(board?.height, DEFAULT_BOARD_HEIGHT_MM)
  return [
    { x: center.x - width / 2, y: center.y - height / 2 },
    { x: center.x + width / 2, y: center.y - height / 2 },
    { x: center.x + width / 2, y: center.y + height / 2 },
    { x: center.x - width / 2, y: center.y + height / 2 },
  ]
}

type PcbNetEntry = {
  index: number
  name: string
  sourcePortIds: string[]
  traceIds: string[]
}

const createPcbNetEntries = (circuitJson: CircuitElement[]): PcbNetEntry[] => {
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

const createPcbDocument = (circuitJson: CircuitElement[]) => {
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

const getSchematicTransform = (elements: CircuitElement[]) => {
  const points: Point[] = []
  for (const element of elements) {
    const center = asPoint(element.center)
    if (center) points.push(center)
    const anchor = asPoint(element.anchor_position)
    if (anchor) points.push(anchor)
    if (element.type === "schematic_trace" && Array.isArray(element.edges)) {
      for (const edge of element.edges as CircuitElement[]) {
        const from = asPoint(edge.from)
        const to = asPoint(edge.to)
        if (from) points.push(from)
        if (to) points.push(to)
      }
    }
    if (
      element.type === "schematic_trace" &&
      Array.isArray(element.junctions)
    ) {
      for (const junction of element.junctions) {
        const point = asPoint(junction)
        if (point) points.push(point)
      }
    }
  }
  const minX =
    points.length > 0 ? Math.min(...points.map((point) => point.x)) : 0
  const maxY =
    points.length > 0 ? Math.max(...points.map((point) => point.y)) : 0
  const transform = (point: Point) => ({
    x: Math.round((point.x - minX) * 20 + 100),
    y: Math.round((maxY - point.y) * 20 + 100),
  })
  const transformed = points.map(transform)
  return {
    transform,
    width: Math.max(400, ...transformed.map((point) => point.x + 100)),
    height: Math.max(300, ...transformed.map((point) => point.y + 100)),
  }
}

const createSchematicDocument = (
  circuitJson: CircuitElement[],
  sheetId: string | undefined,
  isFirstSheet: boolean,
) => {
  const belongsToSheet = (element: CircuitElement) => {
    const elementSheetId = asString(element.schematic_sheet_id)
    return sheetId
      ? elementSheetId === sheetId || (isFirstSheet && !elementSheetId)
      : !elementSheetId || isFirstSheet
  }
  const schematicElements = circuitJson.filter(
    (element) =>
      element.type?.startsWith("schematic_") === true &&
      element.type !== "schematic_sheet" &&
      belongsToSheet(element),
  )
  const { transform, width, height } = getSchematicTransform(schematicElements)
  const lines = [
    "|HEADER=Protel for Windows - Schematic Capture Ascii File Version 5.0",
  ]
  let recordIndex = 0
  const addRecord = (fields: string[]) => {
    const index = recordIndex
    lines.push(`|${fields.join("|")}`)
    recordIndex++
    return index
  }
  addRecord([
    "RECORD=31",
    "FONTIDCOUNT=2",
    "SIZE1=10",
    "FONTNAME1=Arial",
    "SIZE2=9",
    "FONTNAME2=Arial",
    `CUSTOMX=${width}`,
    `CUSTOMY=${height}`,
    "USECUSTOMSHEET=T",
    "SNAPGRIDON=T",
    "SNAPGRIDSIZE=10",
  ])

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
  const portsByComponent = new Map<string, CircuitElement[]>()
  for (const port of schematicElements.filter(
    (element) => element.type === "schematic_port",
  )) {
    const componentId = asString(port.schematic_component_id)
    portsByComponent.set(componentId, [
      ...(portsByComponent.get(componentId) ?? []),
      port,
    ])
  }

  for (const [componentNumber, component] of schematicElements
    .filter((element) => element.type === "schematic_component")
    .entries()) {
    const center = transform(asPoint(component.center) ?? { x: 0, y: 0 })
    const sourceComponent = sourceComponents.get(
      asString(component.source_component_id),
    )
    const designator =
      sanitizeField(sourceComponent?.name) || `U${componentNumber + 1}`
    const value =
      sanitizeField(component.symbol_display_value) ||
      sanitizeField(component.symbol_name) ||
      designator
    const libraryReference = sanitizeField(component.symbol_name) || designator
    const componentIndex = addRecord([
      "RECORD=1",
      `LOCATION.X=${center.x}`,
      `LOCATION.Y=${center.y}`,
      "ORIENTATION=0",
      `LIBREFERENCE=${libraryReference}`,
      "SHOWHIDDENPINS=F",
      "CURRENTPARTID=1",
      "ISMIRRORED=F",
      `UNIQUEID=${sanitizeField(component.schematic_component_id)}`,
    ])
    const size =
      component.size && typeof component.size === "object"
        ? (component.size as CircuitElement)
        : {}
    const halfWidth = Math.max(20, Math.round(asNumber(size.width, 2) * 10))
    const halfHeight = Math.max(15, Math.round(asNumber(size.height, 1.5) * 10))
    addRecord([
      "RECORD=14",
      `OWNERINDEX=${componentIndex}`,
      "OWNERPARTID=1",
      `LOCATION.X=${center.x - halfWidth}`,
      `LOCATION.Y=${center.y - halfHeight}`,
      `CORNER.X=${center.x + halfWidth}`,
      `CORNER.Y=${center.y + halfHeight}`,
      "LINEWIDTH=1",
      "COLOR=136",
      "AREACOLOR=16777215",
      "ISSOLID=F",
    ])
    addRecord([
      "RECORD=34",
      `OWNERINDEX=${componentIndex}`,
      "OWNERPARTID=-1",
      `LOCATION.X=${center.x - halfWidth}`,
      `LOCATION.Y=${center.y - halfHeight - 12}`,
      "FONTID=1",
      "NAME=Designator",
      `TEXT=${designator}`,
      "SHOWNAME=F",
      "ISHIDDEN=F",
      "ORIENTATION=0",
      "JUSTIFICATION=0",
    ])
    addRecord([
      "RECORD=41",
      `OWNERINDEX=${componentIndex}`,
      "OWNERPARTID=-1",
      `LOCATION.X=${center.x - halfWidth}`,
      `LOCATION.Y=${center.y + halfHeight + 12}`,
      "FONTID=2",
      "NAME=Comment",
      `TEXT=${value}`,
      "SHOWNAME=F",
      "ISHIDDEN=F",
      "ORIENTATION=0",
      "JUSTIFICATION=0",
    ])

    for (const [pinIndex, port] of (
      portsByComponent.get(asString(component.schematic_component_id)) ?? []
    ).entries()) {
      const sourcePort = sourcePorts.get(asString(port.source_port_id))
      const pinCenter = transform(asPoint(port.center) ?? { x: 0, y: 0 })
      const orientation =
        {
          left: 58,
          right: 56,
          up: 57,
          down: 59,
        }[asString(port.facing_direction)] ?? 58
      addRecord([
        "RECORD=2",
        `OWNERINDEX=${componentIndex}`,
        "OWNERPARTID=1",
        `DESIGNATOR=${sanitizeField(sourcePort?.pin_number) || pinIndex + 1}`,
        `NAME=${sanitizeField(port.display_pin_label) || sanitizeField(sourcePort?.name) || `Pin ${pinIndex + 1}`}`,
        `PINCONGLOMERATE=${orientation}`,
        `LOCATION.X=${pinCenter.x}`,
        `LOCATION.Y=${pinCenter.y}`,
        "PINLENGTH=10",
        "COLOR=136",
        "FONTID=2",
      ])
    }
  }

  for (const trace of schematicElements.filter(
    (element) => element.type === "schematic_trace",
  )) {
    if (!Array.isArray(trace.edges)) continue
    for (const edge of trace.edges as CircuitElement[]) {
      const from = asPoint(edge.from)
      const to = asPoint(edge.to)
      if (!from || !to) continue
      const start = transform(from)
      const end = transform(to)
      addRecord([
        "RECORD=27",
        "LINEWIDTH=1",
        "LOCATIONCOUNT=2",
        `X1=${start.x}`,
        `Y1=${start.y}`,
        `X2=${end.x}`,
        `Y2=${end.y}`,
        "COLOR=34816",
      ])
    }
  }

  const emittedJunctions = new Set<string>()
  for (const trace of schematicElements.filter(
    (element) => element.type === "schematic_trace",
  )) {
    if (!Array.isArray(trace.junctions)) continue
    for (const junction of trace.junctions) {
      const point = asPoint(junction)
      if (!point) continue
      const location = transform(point)
      const key = `${location.x}:${location.y}`
      if (emittedJunctions.has(key)) continue
      emittedJunctions.add(key)
      addRecord([
        "RECORD=29",
        `LOCATION.X=${location.x}`,
        `LOCATION.Y=${location.y}`,
        "COLOR=34816",
      ])
    }
  }

  for (const label of schematicElements.filter(
    (element) => element.type === "schematic_net_label",
  )) {
    const text = sanitizeField(label.text)
    if (!text) continue
    const center = transform(
      asPoint(label.anchor_position) ?? asPoint(label.center) ?? { x: 0, y: 0 },
    )
    addRecord([
      "RECORD=25",
      `LOCATION.X=${center.x}`,
      `LOCATION.Y=${center.y}`,
      "FONTID=2",
      "ORIENTATION=0",
      "JUSTIFICATION=0",
      `TEXT=${text}`,
    ])
  }

  return `${lines.join("\r\n")}\r\n`
}

export async function convertCircuitJsonToAltiumZip(
  circuitJson: CircuitElement[],
  projectName: string,
): Promise<Uint8Array> {
  const safeProjectName = sanitizeFilename(projectName)
  const pcbFilename = `${safeProjectName}.PcbDoc`
  const pcbDocument = createPcbDocument(circuitJson)
  const sheets = byType(circuitJson, "schematic_sheet").sort(
    (a, b) => asNumber(a.sheet_index) - asNumber(b.sheet_index),
  )
  const sheetDefinitions = sheets.length > 0 ? sheets : [undefined]
  const schematicFiles = sheetDefinitions.map((sheet, index) => {
    const suffix =
      sheetDefinitions.length > 1
        ? `-${String(index + 1).padStart(2, "0")}`
        : ""
    return {
      filename: `${safeProjectName}${suffix}.SchDoc`,
      content: createSchematicDocument(
        circuitJson,
        sheet ? asString(sheet.schematic_sheet_id) : undefined,
        index === 0,
      ),
    }
  })
  const projectFilename = `${safeProjectName}.PrjPcb`
  const projectDocument = [
    "[Design]",
    `ProjectName=${safeProjectName}`,
    "",
    ...[
      { path: pcbFilename, kind: "pcb-document" },
      ...schematicFiles.map(({ filename }) => ({
        path: filename,
        kind: "schematic-document",
      })),
    ].flatMap((document, index) => [
      `[Document${index + 1}]`,
      `DocumentPath=${document.path}`,
      `DocumentKind=${document.kind}`,
      "",
    ]),
  ].join("\r\n")

  parseAltiumPcbDoc(pcbDocument, { mode: "strict" })
  for (const schematic of schematicFiles) {
    parseAltiumSchDoc(schematic.content)
  }
  parseAltiumPrjPcb(projectDocument)

  const zip = new JSZip()
  zip.file(projectFilename, projectDocument)
  zip.file(pcbFilename, pcbDocument)
  for (const schematic of schematicFiles) {
    zip.file(schematic.filename, schematic.content)
  }
  zip.file(
    "README.txt",
    [
      `${projectName} — Altium Designer project`,
      "",
      "Generated in advance from the board's routed Circuit JSON.",
      `Open ${projectFilename} in Altium Designer.`,
    ].join("\r\n"),
  )

  return zip.generateAsync({ type: "uint8array" })
}
