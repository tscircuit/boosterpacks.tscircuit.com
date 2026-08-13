import { expect } from "bun:test"
import {
  type AltiumPcbDoc,
  type AltiumSchDoc,
  getDanglingPcbReferences,
  parseAltiumPcbDoc,
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

export const sourceComponent = (id: string, name: string): CircuitElement => ({
  type: "source_component",
  source_component_id: id,
  name,
})

export const sourcePort = (
  id: string,
  componentId: string,
  pinNumber: number,
): CircuitElement => ({
  type: "source_port",
  source_port_id: id,
  source_component_id: componentId,
  pin_number: pinNumber,
  name: `pin${pinNumber}`,
})

export const pcbComponent = (
  id: string,
  sourceId: string,
  overrides: Record<string, unknown> = {},
): CircuitElement => ({
  type: "pcb_component",
  pcb_component_id: id,
  source_component_id: sourceId,
  center: { x: 0, y: 0 },
  width: 2,
  height: 1,
  layer: "top",
  rotation: 0,
  ...overrides,
})

export const pcbPort = (
  id: string,
  sourceId: string,
  componentId: string,
): CircuitElement => ({
  type: "pcb_port",
  pcb_port_id: id,
  source_port_id: sourceId,
  pcb_component_id: componentId,
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
  const pcbSource = await zip.file(pcbFilename)?.async("string")
  if (!projectSource || !pcbSource) throw new Error("Unreadable Altium archive")
  const project = parseAltiumPrjPcb(projectSource)
  const pcb = parseAltiumPcbDoc(pcbSource, { mode: "strict" })
  const schematicSources = await Promise.all(
    schematicFilenames.map(async (filename) => {
      const source = await zip.file(filename)?.async("string")
      if (!source) throw new Error(`Unreadable schematic ${filename}`)
      return { filename, source }
    }),
  )
  const schematics = schematicSources.map(({ source }) =>
    parseAltiumSchDoc(source),
  )
  return {
    filenames,
    pcbSource,
    project,
    projectFilename,
    schematicSources,
    pcb,
    schematics,
    zip,
  }
}

export const expectValidPcb = (pcb: AltiumPcbDoc) => {
  expect(validateAltiumDocument(pcb, { profile: "strict" }).valid).toBe(true)
  expect(getDanglingPcbReferences(pcb)).toEqual([])
}

export const expectValidSchematic = (schematic: AltiumSchDoc) => {
  expect(validateAltiumDocument(schematic, { profile: "strict" }).valid).toBe(
    true,
  )
  expect(schematic.index.getOwnershipCycles()).toEqual([])
}
