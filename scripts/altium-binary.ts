import CFB from "cfb"

const NO_INDEX = 0xffff
const INTERNAL_UNITS_PER_MIL = 10_000

const PCB_OBJECT = {
  pad: 2,
  via: 3,
  track: 4,
} as const

const PCB_LAYER = {
  top: 1,
  bottom: 32,
  multilayer: 74,
} as const

class BinaryWriter {
  private readonly bytes: number[] = []

  writeUint8(value: number) {
    this.bytes.push(value & 0xff)
  }

  writeUint16(value: number) {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff)
  }

  writeUint32(value: number) {
    this.bytes.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    )
  }

  writeInt32(value: number) {
    this.writeUint32(value >>> 0)
  }

  writeFloat64(value: number) {
    const buffer = new ArrayBuffer(8)
    new DataView(buffer).setFloat64(0, value, true)
    this.writeBytes(new Uint8Array(buffer))
  }

  writeBytes(value: Uint8Array | number[]) {
    this.bytes.push(...value)
  }

  toUint8Array() {
    return Uint8Array.from(this.bytes)
  }
}

const concatBytes = (...parts: Uint8Array[]) => {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

const asciiBytes = (value: string) =>
  Uint8Array.from(value, (character) => character.charCodeAt(0) & 0x7f)

const toAltiumParamBytes = (line: string) => {
  const output: number[] = []
  for (const segment of line.split("|")) {
    if (!segment) continue
    const equals = segment.indexOf("=")
    if (equals < 1) continue
    const key = segment.slice(0, equals)
    const value = segment.slice(equals + 1)
    if (/[^\x20-\x7e]/u.test(value)) {
      output.push(
        ...new TextEncoder().encode(`|%UTF8%${key}=${value.trim()}||`),
      )
    }
    output.push(
      ...asciiBytes(`|${key}=${value.replace(/[^\x20-\x7e]/gu, "?")}`),
    )
  }
  output.push(0)
  return Uint8Array.from(output)
}

const writeLengthPrefixedRecords = (lines: string[]) => {
  const writer = new BinaryWriter()
  for (const line of lines) {
    const params = toAltiumParamBytes(line)
    writer.writeUint32(params.length)
    writer.writeBytes(params)
  }
  return writer.toUint8Array()
}

const getFields = (line: string) =>
  new Map(
    line
      .split("|")
      .filter(Boolean)
      .map((segment) => {
        const equals = segment.indexOf("=")
        return [
          segment.slice(0, equals).toUpperCase(),
          segment.slice(equals + 1),
        ]
      }),
  )

const getRecordKind = (line: string) => getFields(line).get("RECORD") ?? ""

const parseMil = (value: string | undefined) => {
  const mils = Number.parseFloat(value ?? "0")
  return Number.isFinite(mils) ? Math.round(mils * INTERNAL_UNITS_PER_MIL) : 0
}

const parseIndex = (value: string | undefined) => {
  if (value === undefined) return NO_INDEX
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed >= 0 && parsed < NO_INDEX
    ? parsed
    : NO_INDEX
}

const parseLayer = (
  value: string | undefined,
  fallback: number = PCB_LAYER.top,
) => {
  switch (value?.toUpperCase()) {
    case "TOP":
      return PCB_LAYER.top
    case "BOTTOM":
      return PCB_LAYER.bottom
    case "MULTILAYER":
      return PCB_LAYER.multilayer
    default:
      return fallback
  }
}

const writePrimitiveCommon = (
  writer: BinaryWriter,
  fields: Map<string, string>,
  defaultLayer: number,
) => {
  writer.writeUint8(parseLayer(fields.get("LAYER"), defaultLayer))
  writer.writeUint16(0)
  writer.writeUint16(parseIndex(fields.get("NET")))
  writer.writeUint16(parseIndex(fields.get("POLYGON")))
  writer.writeUint16(parseIndex(fields.get("COMPONENT")))
  writer.writeUint16(NO_INDEX)
  writer.writeUint16(NO_INDEX)
}

const pascalString = (value: string) => {
  const bytes = asciiBytes(value.slice(0, 255))
  return concatBytes(Uint8Array.of(bytes.length), bytes)
}

const serializePad = (line: string) => {
  const fields = getFields(line)
  const layer = parseLayer(fields.get("LAYER"))
  const shape = fields.get("SHAPE") === "ROUND" ? 1 : 2
  const xSize = parseMil(fields.get("XSIZE"))
  const ySize = parseMil(fields.get("YSIZE"))
  const main = new BinaryWriter()
  writePrimitiveCommon(main, fields, layer)
  main.writeInt32(parseMil(fields.get("X")))
  main.writeInt32(parseMil(fields.get("Y")))
  for (let index = 0; index < 3; index++) {
    main.writeInt32(xSize)
    main.writeInt32(ySize)
  }
  main.writeInt32(parseMil(fields.get("HOLESIZE")))
  main.writeUint8(shape)
  main.writeUint8(shape)
  main.writeUint8(shape)
  main.writeFloat64(Number.parseFloat(fields.get("ROTATION") ?? "0") || 0)
  main.writeUint8(fields.get("PLATED") === "FALSE" ? 0 : 1)
  main.writeUint8(0)
  main.writeUint8(0)
  main.writeInt32(0)
  main.writeBytes(new Uint8Array(38))
  main.writeUint8(0)
  main.writeInt32(0)
  main.writeInt32(0)

  return [
    pascalString(fields.get("NAME") ?? ""),
    pascalString(""),
    pascalString(""),
    pascalString(""),
    main.toUint8Array(),
    new Uint8Array(),
  ]
}

const serializeTrack = (line: string) => {
  const fields = getFields(line)
  const writer = new BinaryWriter()
  writePrimitiveCommon(writer, fields, parseLayer(fields.get("LAYER")))
  writer.writeInt32(parseMil(fields.get("X1")))
  writer.writeInt32(parseMil(fields.get("Y1")))
  writer.writeInt32(parseMil(fields.get("X2")))
  writer.writeInt32(parseMil(fields.get("Y2")))
  writer.writeInt32(parseMil(fields.get("WIDTH")))
  writer.writeUint16(NO_INDEX)
  return [writer.toUint8Array()]
}

const serializeVia = (line: string) => {
  const fields = getFields(line)
  const writer = new BinaryWriter()
  writePrimitiveCommon(writer, fields, PCB_LAYER.multilayer)
  writer.writeInt32(parseMil(fields.get("X")))
  writer.writeInt32(parseMil(fields.get("Y")))
  writer.writeInt32(parseMil(fields.get("DIAMETER")))
  writer.writeInt32(parseMil(fields.get("HOLESIZE")))
  writer.writeUint8(PCB_LAYER.top)
  writer.writeUint8(PCB_LAYER.bottom)
  return [writer.toUint8Array()]
}

const writePrimitiveRecords = (objectId: number, records: Uint8Array[][]) => {
  const writer = new BinaryWriter()
  for (const subrecords of records) {
    writer.writeUint8(objectId)
    for (const subrecord of subrecords) {
      writer.writeUint32(subrecord.length)
      writer.writeBytes(subrecord)
    }
  }
  return writer.toUint8Array()
}

const uint32Bytes = (value: number) => {
  const writer = new BinaryWriter()
  writer.writeUint32(value)
  return writer.toUint8Array()
}

const addSection = (
  compoundFile: ReturnType<typeof CFB.utils.cfb_new>,
  name: string,
  count: number,
  data: Uint8Array,
) => {
  CFB.utils.cfb_add(compoundFile, `/${name}/Header`, uint32Bytes(count))
  CFB.utils.cfb_add(compoundFile, `/${name}/Data`, data)
}

const writeCompoundFile = (
  compoundFile: ReturnType<typeof CFB.utils.cfb_new>,
) => {
  const output = CFB.write(compoundFile, { type: "buffer", fileType: "cfb" })
  return new Uint8Array(output)
}

export const createBinaryPcbDocument = (asciiDocument: string) => {
  const lines = asciiDocument.split(/\r?\n/u).filter(Boolean)
  const board = lines.filter((line) => getRecordKind(line) === "Board")
  const nets = lines.filter((line) => getRecordKind(line) === "Net")
  const components = lines.filter((line) => getRecordKind(line) === "Component")
  const pads = lines.filter((line) => getRecordKind(line) === "Pad")
  const vias = lines.filter((line) => getRecordKind(line) === "Via")
  const tracks = lines.filter((line) => getRecordKind(line) === "Track")

  const compoundFile = CFB.utils.cfb_new({ root: "Root Entry" })
  const legacyHeader = new BinaryWriter()
  legacyHeader.writeUint32("PCB 5.0 Binary File".length)
  for (const character of "PCB 5.0 Bi") {
    legacyHeader.writeUint16(character.charCodeAt(0))
  }
  CFB.utils.cfb_add(compoundFile, "/FileHeader", legacyHeader.toUint8Array())

  const currentHeader = new BinaryWriter()
  const version = "PCB 6.0 Binary File"
  currentHeader.writeUint32(version.length)
  currentHeader.writeBytes(pascalString(version))
  currentHeader.writeFloat64(5.01)
  CFB.utils.cfb_add(
    compoundFile,
    "/FileHeaderSix",
    currentHeader.toUint8Array(),
  )

  addSection(
    compoundFile,
    "Board6",
    board.length,
    writeLengthPrefixedRecords(board),
  )
  addSection(
    compoundFile,
    "Nets6",
    nets.length,
    writeLengthPrefixedRecords(nets),
  )
  addSection(
    compoundFile,
    "Components6",
    components.length,
    writeLengthPrefixedRecords(components),
  )
  addSection(
    compoundFile,
    "Pads6",
    pads.length,
    writePrimitiveRecords(PCB_OBJECT.pad, pads.map(serializePad)),
  )
  addSection(
    compoundFile,
    "Vias6",
    vias.length,
    writePrimitiveRecords(PCB_OBJECT.via, vias.map(serializeVia)),
  )
  addSection(
    compoundFile,
    "Tracks6",
    tracks.length,
    writePrimitiveRecords(PCB_OBJECT.track, tracks.map(serializeTrack)),
  )

  for (const section of [
    "Arcs6",
    "Polygons6",
    "Texts6",
    "Fills6",
    "Regions6",
    "ComponentBodies6",
    "Classes6",
    "DifferentialPairs6",
    "Connections6",
    "WideStrings6",
  ]) {
    addSection(compoundFile, section, 0, new Uint8Array())
  }

  return writeCompoundFile(compoundFile)
}

const writeTextBlock = (params: Uint8Array) =>
  concatBytes(uint32Bytes(params.length), params)

export const createBinarySchematicDocument = (asciiDocument: string) => {
  const lines = asciiDocument.split(/\r?\n/u).filter(Boolean)
  const records = lines.filter((line) => !line.startsWith("|HEADER="))
  const binaryHeader =
    "Protel for Windows - Schematic Capture Binary File Version 5.0"
  const fileHeader = [
    writeTextBlock(
      toAltiumParamBytes(
        `|HEADER=${binaryHeader}|WEIGHT=${records.length}|MINORVERSION=0|UNIQUEID=TSCIRCUIT`,
      ),
    ),
    ...records.map((line) => writeTextBlock(toAltiumParamBytes(line))),
  ]

  const compoundFile = CFB.utils.cfb_new({ root: "Root Entry" })
  CFB.utils.cfb_add(compoundFile, "/FileHeader", concatBytes(...fileHeader))
  CFB.utils.cfb_add(
    compoundFile,
    "/Storage",
    writeTextBlock(toAltiumParamBytes("|HEADER=Icon storage")),
  )
  CFB.utils.cfb_add(
    compoundFile,
    "/Additional",
    writeTextBlock(toAltiumParamBytes(`|HEADER=${binaryHeader}`)),
  )
  return writeCompoundFile(compoundFile)
}
