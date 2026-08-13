import { expect } from "bun:test"
import {
  type AltiumPcbDocument,
  type AltiumSchDoc,
  getDanglingPcbReferences,
  parseAltiumBinaryPcbDoc,
  parseAltiumPrjPcb,
  parseAltiumSchDoc,
  validateAltiumDocument,
} from "altiumts"
import JSZip from "jszip"
import { convertCircuitJsonToAltiumZip } from "../../scripts/circuit-json-to-altium"

export type CircuitElement = Record<string, unknown> & { type: string }

export const board = (
  overrides: Record<string, unknown> = {},
): CircuitElement => ({
  type: "pcb_board",
  center: { x: 0, y: 0 },
  width: 20,
  height: 12,
  ...overrides,
})

export const sourceComponent = (
  sourceComponentId: string,
  name: string,
): CircuitElement => ({
  type: "source_component",
  source_component_id: sourceComponentId,
  name,
})

type SourcePortFixtureParams = {
  pinNumber: number
  sourceComponentId: string
  sourcePortId: string
}

export const sourcePort = ({
  pinNumber,
  sourceComponentId,
  sourcePortId,
}: SourcePortFixtureParams): CircuitElement => ({
  type: "source_port",
  source_port_id: sourcePortId,
  source_component_id: sourceComponentId,
  pin_number: pinNumber,
  name: `pin${pinNumber}`,
})

type PcbComponentFixtureParams = {
  overrides?: Record<string, unknown>
  pcbComponentId: string
  sourceComponentId: string
}

export const pcbComponent = ({
  overrides = {},
  pcbComponentId,
  sourceComponentId,
}: PcbComponentFixtureParams): CircuitElement => ({
  type: "pcb_component",
  pcb_component_id: pcbComponentId,
  source_component_id: sourceComponentId,
  center: { x: 0, y: 0 },
  width: 2,
  height: 1,
  layer: "top",
  rotation: 0,
  ...overrides,
})

type PcbPortFixtureParams = {
  pcbComponentId: string
  pcbPortId: string
  sourcePortId: string
}

export const pcbPort = ({
  pcbComponentId,
  pcbPortId,
  sourcePortId,
}: PcbPortFixtureParams): CircuitElement => ({
  type: "pcb_port",
  pcb_port_id: pcbPortId,
  source_port_id: sourcePortId,
  pcb_component_id: pcbComponentId,
})

export const extractArchive = async (
  elements: CircuitElement[],
  projectName = "example-board",
) => {
  const zip = await JSZip.loadAsync(
    await convertCircuitJsonToAltiumZip(elements, projectName),
  )
  const filenames = Object.keys(zip.files).sort()
  const projectFilename = filenames.find((name) => name.endsWith(".PrjPcb"))
  const pcbFilename = filenames.find((name) => name.endsWith(".PcbDoc"))
  const schematicFilenames = filenames.filter((name) =>
    name.endsWith(".SchDoc"),
  )
  if (!projectFilename || !pcbFilename || schematicFilenames.length === 0) {
    throw new Error(`Incomplete Altium archive: ${filenames.join(", ")}`)
  }
  const projectSource = await zip.file(projectFilename)?.async("string")
  const pcbBytes = await zip.file(pcbFilename)?.async("uint8array")
  if (!projectSource || !pcbBytes) throw new Error("Unreadable Altium archive")
  const project = parseAltiumPrjPcb(projectSource)
  const pcb = parseAltiumBinaryPcbDoc(pcbBytes)
  const schematicSources = await Promise.all(
    schematicFilenames.map(async (filename) => {
      const bytes = await zip.file(filename)?.async("uint8array")
      if (!bytes) throw new Error(`Unreadable schematic ${filename}`)
      return { filename, bytes }
    }),
  )
  const schematics = schematicSources.map(({ bytes }) =>
    parseAltiumSchDoc(bytes),
  )
  return {
    filenames,
    pcbBytes,
    project,
    projectFilename,
    schematicSources,
    pcb,
    schematics,
    zip,
  }
}

export const expectValidPcb = (pcb: AltiumPcbDocument) => {
  expect(validateAltiumDocument(pcb, { profile: "strict" }).valid).toBe(true)
  expect(getDanglingPcbReferences(pcb)).toEqual([])
}

export const expectValidSchematic = (schematic: AltiumSchDoc) => {
  expect(validateAltiumDocument(schematic, { profile: "strict" }).valid).toBe(
    true,
  )
  expect(schematic.index.getOwnershipCycles()).toEqual([])
}
