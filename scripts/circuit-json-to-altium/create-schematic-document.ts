import { asNumber, asPoint, asString, byType, sanitizeField } from "./format"
import type { CircuitElement, Point } from "./types"

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

export const createSchematicDocument = (
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
