import { expect, test } from "bun:test"
import type { AltiumSchDoc } from "altiumts"
import {
  type CircuitElement,
  board,
  expectValidPcb,
  expectValidSchematic,
  extractArchive,
  pcbComponent,
  pcbPort,
  sourceComponent,
  sourcePort,
} from "./fixtures"

test("creates a parseable project with a connected PCB and schematic", async () => {
  const elements: CircuitElement[] = [
    board(),
    sourceComponent("sc1", "R1"),
    sourcePort("sp1", "sc1", 1),
    {
      type: "source_trace",
      source_trace_id: "st1",
      connected_source_port_ids: ["sp1"],
      name: "SIGNAL",
    },
    pcbComponent("pc1", "sc1"),
    pcbPort("pp1", "sp1", "pc1"),
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad1",
      pcb_component_id: "pc1",
      pcb_port_id: "pp1",
      shape: "rect",
      x: -0.5,
      y: 0,
      width: 0.8,
      height: 0.8,
      layer: "top",
    },
    {
      type: "schematic_component",
      schematic_component_id: "schc1",
      source_component_id: "sc1",
      center: { x: 0, y: 0 },
      size: { width: 2, height: 1 },
      symbol_name: "boxresistor",
      symbol_display_value: "10kΩ",
    },
    {
      type: "schematic_port",
      schematic_port_id: "schp1",
      schematic_component_id: "schc1",
      source_port_id: "sp1",
      center: { x: -1.5, y: 0 },
      facing_direction: "left",
    },
    {
      type: "schematic_trace",
      schematic_trace_id: "scht1",
      source_trace_id: "st1",
      edges: [{ from: { x: -2.5, y: 0 }, to: { x: -1.5, y: 0 } }],
      junctions: [],
    },
  ]

  const result = await extractArchive(elements)

  expect(result.filenames).toEqual([
    "README.txt",
    "example-board.PcbDoc",
    "example-board.PrjPcb",
    "example-board.SchDoc",
  ])
  expect(result.project.documents).toHaveLength(2)
  expect(result.pcb.components[0]?.get("SOURCEDESIGNATOR")).toBe("R1")
  expect(result.pcb.getRecordsByKind("Pad")).toHaveLength(1)
  expect(result.pcb.nets.map((net) => net.name)).toEqual(["SIGNAL"])
  expect(result.schematics[0]?.components).toHaveLength(1)
  expect(result.schematics[0]?.pins).toHaveLength(1)
  expect(result.schematics[0]?.wires).toHaveLength(1)
  expect(result.schematics[0]?.components[0]?.libraryReference).toBe(
    "boxresistor",
  )
  expectValidPcb(result.pcb)
  expectValidSchematic(result.schematics[0] as AltiumSchDoc)
})
