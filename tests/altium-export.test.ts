import { expect, test } from "bun:test"
import {
  parseAltiumPcbDoc,
  parseAltiumPrjPcb,
  parseAltiumSchDoc,
} from "altiumts"
import JSZip from "jszip"
import { convertCircuitJsonToAltiumZip } from "../scripts/circuit-json-to-altium"

test("creates a parseable Altium project archive with viewer-compatible manufacturing files", async () => {
  const archive = await convertCircuitJsonToAltiumZip(
    [
      {
        type: "pcb_board",
        center: { x: 0, y: 0 },
        width: 20,
        height: 12,
      },
      {
        type: "source_component",
        source_component_id: "source_component_1",
        name: "R1",
      },
      {
        type: "source_port",
        source_port_id: "source_port_1",
        source_component_id: "source_component_1",
        pin_number: 1,
        name: "1",
      },
      {
        type: "source_trace",
        source_trace_id: "source_trace_1",
        connected_source_port_ids: ["source_port_1"],
        connected_source_net_ids: [],
        name: "SIGNAL",
      },
      {
        type: "pcb_component",
        pcb_component_id: "pcb_component_1",
        source_component_id: "source_component_1",
        center: { x: 0, y: 0 },
        width: 2,
        height: 1,
        layer: "top",
        rotation: 0,
      },
      {
        type: "pcb_port",
        pcb_port_id: "pcb_port_1",
        source_port_id: "source_port_1",
        pcb_component_id: "pcb_component_1",
        x: -0.5,
        y: 0,
        layers: ["top"],
      },
      {
        type: "pcb_smtpad",
        pcb_smtpad_id: "pcb_smtpad_1",
        pcb_component_id: "pcb_component_1",
        pcb_port_id: "pcb_port_1",
        shape: "rect",
        x: -0.5,
        y: 0,
        width: 0.8,
        height: 0.8,
        layer: "top",
      },
      {
        type: "pcb_plated_hole",
        pcb_plated_hole_id: "pcb_plated_hole_1",
        shape: "circle",
        x: 1,
        y: 0,
        outer_diameter: 1.6,
        hole_diameter: 0.8,
        layers: ["top", "bottom"],
      },
      {
        type: "schematic_component",
        schematic_component_id: "schematic_component_1",
        source_component_id: "source_component_1",
        center: { x: 0, y: 0 },
        size: { width: 2, height: 1 },
        symbol_display_value: "10kΩ",
      },
      {
        type: "schematic_port",
        schematic_port_id: "schematic_port_1",
        schematic_component_id: "schematic_component_1",
        source_port_id: "source_port_1",
        center: { x: -1.5, y: 0 },
        facing_direction: "left",
      },
      {
        type: "schematic_trace",
        schematic_trace_id: "schematic_trace_1",
        source_trace_id: "source_trace_1",
        edges: [
          {
            from: { x: -2.5, y: 0 },
            to: { x: -1.5, y: 0 },
          },
        ],
        junctions: [],
      },
    ],
    "example-board",
  )

  const zip = await JSZip.loadAsync(archive)
  const project = await zip.file("example-board.PrjPcb")?.async("string")
  const pcb = await zip.file("example-board.PcbDoc")?.async("string")
  const schematic = await zip.file("example-board.SchDoc")?.async("string")
  const topCopper = await zip.file("manufacturing/F_Cu.gbr")?.async("string")
  const boardProfile = await zip
    .file("manufacturing/Edge_Cuts.gbr")
    ?.async("string")
  const platedDrill = await zip.file("manufacturing/drill.drl")?.async("string")

  expect(project).toBeDefined()
  expect(pcb).toBeDefined()
  expect(schematic).toBeDefined()
  expect(parseAltiumPrjPcb(project ?? "").documents).toHaveLength(2)
  expect(parseAltiumPcbDoc(pcb ?? "").getRecordsByKind("Pad")).toHaveLength(2)
  expect(parseAltiumSchDoc(schematic ?? "").components).toHaveLength(1)
  expect(topCopper).toContain("%TF.FileFunction,Copper,L1,Top*%")
  expect(boardProfile).toContain("%TF.FileFunction,Profile,NP*%")
  expect(platedDrill).toStartWith("M48")
})
