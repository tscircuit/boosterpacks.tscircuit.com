import { asNumber, asPoint, asString, byType, sanitizeField } from "./format"
import { getSchematicTransform } from "./get-schematic-transform"
import type {
  CircuitElement,
  SchematicComponentId,
  SchematicSheetId,
  SourceComponentId,
  SourcePortId,
} from "./types"

type CreateSchematicDocumentParams = {
  circuitJson: CircuitElement[]
  isFirstSchematicSheet: boolean
  schematicSheetId: SchematicSheetId | undefined
}

type SchematicSheetMembershipParams = {
  element: CircuitElement
  isFirstSchematicSheet: boolean
  schematicSheetId: SchematicSheetId | undefined
}

type SchematicRecordContext = {
  lines: string[]
  nextRecordIndex: number
}

type AltiumSchematicPointKey = string

function doesElementBelongToSchematicSheet({
  element,
  isFirstSchematicSheet,
  schematicSheetId,
}: SchematicSheetMembershipParams): boolean {
  const elementSchematicSheetId = asString(element.schematic_sheet_id)
  return schematicSheetId
    ? elementSchematicSheetId === schematicSheetId ||
        (isFirstSchematicSheet && !elementSchematicSheetId)
    : !elementSchematicSheetId || isFirstSchematicSheet
}

function addSchematicRecord(
  recordFields: string[],
  ctx: SchematicRecordContext,
): number {
  const altiumRecordIndex = ctx.nextRecordIndex
  ctx.lines.push(`|${recordFields.join("|")}`)
  ctx.nextRecordIndex++
  return altiumRecordIndex
}

export function createSchematicDocument({
  circuitJson,
  isFirstSchematicSheet,
  schematicSheetId,
}: CreateSchematicDocumentParams): string {
  const schematicElements = circuitJson.filter(
    (element) =>
      element.type?.startsWith("schematic_") === true &&
      element.type !== "schematic_sheet" &&
      doesElementBelongToSchematicSheet({
        element,
        isFirstSchematicSheet,
        schematicSheetId,
      }),
  )
  const {
    circuitToAltiumSchematicPoint,
    width: altiumSheetWidth,
    height: altiumSheetHeight,
  } = getSchematicTransform(schematicElements)
  const schematicRecordContext: SchematicRecordContext = {
    lines: [
      "|HEADER=Protel for Windows - Schematic Capture Ascii File Version 5.0",
    ],
    nextRecordIndex: 0,
  }
  addSchematicRecord(
    [
      "RECORD=31",
      "FONTIDCOUNT=2",
      "SIZE1=10",
      "FONTNAME1=Arial",
      "SIZE2=9",
      "FONTNAME2=Arial",
      `CUSTOMX=${altiumSheetWidth}`,
      `CUSTOMY=${altiumSheetHeight}`,
      "USECUSTOMSHEET=T",
      "SNAPGRIDON=T",
      "SNAPGRIDSIZE=10",
    ],
    schematicRecordContext,
  )

  const sourceComponents = new Map<SourceComponentId, CircuitElement>(
    byType(circuitJson, "source_component")
      .filter((element) => typeof element.source_component_id === "string")
      .map((element) => [asString(element.source_component_id), element]),
  )
  const sourcePorts = new Map<SourcePortId, CircuitElement>(
    byType(circuitJson, "source_port").map((sourcePort) => [
      asString(sourcePort.source_port_id),
      sourcePort,
    ]),
  )
  const schematicPortsByComponentId = new Map<
    SchematicComponentId,
    CircuitElement[]
  >()
  for (const schematicPort of schematicElements.filter(
    (element) => element.type === "schematic_port",
  )) {
    const schematicComponentId = asString(schematicPort.schematic_component_id)
    schematicPortsByComponentId.set(schematicComponentId, [
      ...(schematicPortsByComponentId.get(schematicComponentId) ?? []),
      schematicPort,
    ])
  }

  for (const [componentNumber, schematicComponent] of schematicElements
    .filter((element) => element.type === "schematic_component")
    .entries()) {
    const altiumComponentCenter = circuitToAltiumSchematicPoint(
      asPoint(schematicComponent.center) ?? { x: 0, y: 0 },
    )
    const sourceComponent = sourceComponents.get(
      asString(schematicComponent.source_component_id),
    )
    const designator =
      sanitizeField(sourceComponent?.name) || `U${componentNumber + 1}`
    const componentComment =
      sanitizeField(schematicComponent.symbol_display_value) ||
      sanitizeField(schematicComponent.symbol_name) ||
      designator
    const libraryReference =
      sanitizeField(schematicComponent.symbol_name) || designator
    const altiumComponentRecordIndex = addSchematicRecord(
      [
        "RECORD=1",
        `LOCATION.X=${altiumComponentCenter.x}`,
        `LOCATION.Y=${altiumComponentCenter.y}`,
        "ORIENTATION=0",
        `LIBREFERENCE=${libraryReference}`,
        "SHOWHIDDENPINS=F",
        "CURRENTPARTID=1",
        "ISMIRRORED=F",
        `UNIQUEID=${sanitizeField(schematicComponent.schematic_component_id)}`,
      ],
      schematicRecordContext,
    )
    const componentSize =
      schematicComponent.size && typeof schematicComponent.size === "object"
        ? (schematicComponent.size as CircuitElement)
        : {}
    const altiumHalfWidth = Math.max(
      20,
      Math.round(asNumber(componentSize.width, 2) * 10),
    )
    const altiumHalfHeight = Math.max(
      15,
      Math.round(asNumber(componentSize.height, 1.5) * 10),
    )
    addSchematicRecord(
      [
        "RECORD=14",
        `OWNERINDEX=${altiumComponentRecordIndex}`,
        "OWNERPARTID=1",
        `LOCATION.X=${altiumComponentCenter.x - altiumHalfWidth}`,
        `LOCATION.Y=${altiumComponentCenter.y - altiumHalfHeight}`,
        `CORNER.X=${altiumComponentCenter.x + altiumHalfWidth}`,
        `CORNER.Y=${altiumComponentCenter.y + altiumHalfHeight}`,
        "LINEWIDTH=1",
        "COLOR=136",
        "AREACOLOR=16777215",
        "ISSOLID=F",
      ],
      schematicRecordContext,
    )
    addSchematicRecord(
      [
        "RECORD=34",
        `OWNERINDEX=${altiumComponentRecordIndex}`,
        "OWNERPARTID=-1",
        `LOCATION.X=${altiumComponentCenter.x - altiumHalfWidth}`,
        `LOCATION.Y=${altiumComponentCenter.y - altiumHalfHeight - 12}`,
        "FONTID=1",
        "NAME=Designator",
        `TEXT=${designator}`,
        "SHOWNAME=F",
        "ISHIDDEN=F",
        "ORIENTATION=0",
        "JUSTIFICATION=0",
      ],
      schematicRecordContext,
    )
    addSchematicRecord(
      [
        "RECORD=41",
        `OWNERINDEX=${altiumComponentRecordIndex}`,
        "OWNERPARTID=-1",
        `LOCATION.X=${altiumComponentCenter.x - altiumHalfWidth}`,
        `LOCATION.Y=${altiumComponentCenter.y + altiumHalfHeight + 12}`,
        "FONTID=2",
        "NAME=Comment",
        `TEXT=${componentComment}`,
        "SHOWNAME=F",
        "ISHIDDEN=F",
        "ORIENTATION=0",
        "JUSTIFICATION=0",
      ],
      schematicRecordContext,
    )

    const schematicComponentId = asString(
      schematicComponent.schematic_component_id,
    )
    const schematicPorts =
      schematicPortsByComponentId.get(schematicComponentId) ?? []
    for (const [pinIndex, schematicPort] of schematicPorts.entries()) {
      const sourcePort = sourcePorts.get(asString(schematicPort.source_port_id))
      const altiumPinCenter = circuitToAltiumSchematicPoint(
        asPoint(schematicPort.center) ?? { x: 0, y: 0 },
      )
      const altiumPinConglomerate =
        {
          left: 58,
          right: 56,
          up: 57,
          down: 59,
        }[asString(schematicPort.facing_direction)] ?? 58
      addSchematicRecord(
        [
          "RECORD=2",
          `OWNERINDEX=${altiumComponentRecordIndex}`,
          "OWNERPARTID=1",
          `DESIGNATOR=${sanitizeField(sourcePort?.pin_number) || pinIndex + 1}`,
          `NAME=${sanitizeField(schematicPort.display_pin_label) || sanitizeField(sourcePort?.name) || `Pin ${pinIndex + 1}`}`,
          `PINCONGLOMERATE=${altiumPinConglomerate}`,
          `LOCATION.X=${altiumPinCenter.x}`,
          `LOCATION.Y=${altiumPinCenter.y}`,
          "PINLENGTH=10",
          "COLOR=136",
          "FONTID=2",
        ],
        schematicRecordContext,
      )
    }
  }

  for (const schematicTrace of schematicElements.filter(
    (element) => element.type === "schematic_trace",
  )) {
    if (!Array.isArray(schematicTrace.edges)) continue
    for (const edge of schematicTrace.edges as CircuitElement[]) {
      const circuitStartPoint = asPoint(edge.from)
      const circuitEndPoint = asPoint(edge.to)
      if (!circuitStartPoint || !circuitEndPoint) continue
      const altiumStartPoint = circuitToAltiumSchematicPoint(circuitStartPoint)
      const altiumEndPoint = circuitToAltiumSchematicPoint(circuitEndPoint)
      addSchematicRecord(
        [
          "RECORD=27",
          "LINEWIDTH=1",
          "LOCATIONCOUNT=2",
          `X1=${altiumStartPoint.x}`,
          `Y1=${altiumStartPoint.y}`,
          `X2=${altiumEndPoint.x}`,
          `Y2=${altiumEndPoint.y}`,
          "COLOR=34816",
        ],
        schematicRecordContext,
      )
    }
  }

  const emittedJunctions = new Set<AltiumSchematicPointKey>()
  for (const schematicTrace of schematicElements.filter(
    (element) => element.type === "schematic_trace",
  )) {
    if (!Array.isArray(schematicTrace.junctions)) continue
    for (const junction of schematicTrace.junctions) {
      const circuitJunctionPoint = asPoint(junction)
      if (!circuitJunctionPoint) continue
      const altiumJunctionPoint =
        circuitToAltiumSchematicPoint(circuitJunctionPoint)
      const altiumJunctionPointKey = `${altiumJunctionPoint.x}:${altiumJunctionPoint.y}`
      if (emittedJunctions.has(altiumJunctionPointKey)) continue
      emittedJunctions.add(altiumJunctionPointKey)
      addSchematicRecord(
        [
          "RECORD=29",
          `LOCATION.X=${altiumJunctionPoint.x}`,
          `LOCATION.Y=${altiumJunctionPoint.y}`,
          "COLOR=34816",
        ],
        schematicRecordContext,
      )
    }
  }

  for (const schematicNetLabel of schematicElements.filter(
    (element) => element.type === "schematic_net_label",
  )) {
    const labelText = sanitizeField(schematicNetLabel.text)
    if (!labelText) continue
    const altiumLabelPosition = circuitToAltiumSchematicPoint(
      asPoint(schematicNetLabel.anchor_position) ??
        asPoint(schematicNetLabel.center) ?? { x: 0, y: 0 },
    )
    addSchematicRecord(
      [
        "RECORD=25",
        `LOCATION.X=${altiumLabelPosition.x}`,
        `LOCATION.Y=${altiumLabelPosition.y}`,
        "FONTID=2",
        "ORIENTATION=0",
        "JUSTIFICATION=0",
        `TEXT=${labelText}`,
      ],
      schematicRecordContext,
    )
  }

  return `${schematicRecordContext.lines.join("\r\n")}\r\n`
}
