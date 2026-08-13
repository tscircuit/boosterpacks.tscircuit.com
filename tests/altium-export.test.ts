import { expect, test } from "bun:test"
import {
  parseAltiumBinaryPcbDoc,
  parseAltiumPrjPcb,
  parseAltiumSchDoc,
} from "altiumts"
import JSZip from "jszip"
import { convertCircuitJsonToAltiumZip } from "../scripts/circuit-json-to-altium"

test("creates a parseable native-binary Altium project archive", async () => {
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
        type: "pcb_trace",
        pcb_trace_id: "pcb_trace_1",
        source_trace_id: "source_trace_1",
        route: [
          { route_type: "wire", x: -0.5, y: 0, width: 0.2, layer: "top" },
          { route_type: "wire", x: 0.5, y: 0, width: 0.2, layer: "top" },
        ],
      },
      {
        type: "pcb_via",
        pcb_via_id: "pcb_via_1",
        pcb_trace_id: "pcb_trace_1",
        source_trace_id: "source_trace_1",
        x: 0.5,
        y: 0,
        outer_diameter: 0.6,
        hole_diameter: 0.3,
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
  const pcb = await zip.file("example-board.PcbDoc")?.async("uint8array")
  const schematic = await zip.file("example-board.SchDoc")?.async("uint8array")

  expect(project).toBeDefined()
  expect(pcb).toBeDefined()
  expect(schematic).toBeDefined()
  expect(pcb?.slice(0, 8)).toEqual(
    Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1),
  )
  expect(schematic?.slice(0, 8)).toEqual(
    Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1),
  )
  expect(parseAltiumPrjPcb(project ?? "").documents).toHaveLength(2)
  const parsedPcb = parseAltiumBinaryPcbDoc(pcb ?? new Uint8Array())
  expect(parsedPcb.getRecordsByKind("Pad")).toHaveLength(2)
  expect(parsedPcb.getRecordsByKind("Track")).toHaveLength(1)
  expect(parsedPcb.getRecordsByKind("Via")).toHaveLength(1)
  expect(parsedPcb.boardGeometry.outline?.points).toHaveLength(5)
  expect(
    parseAltiumSchDoc(schematic ?? new Uint8Array()).components,
  ).toHaveLength(1)
  expect(Object.keys(zip.files).some((name) => name.endsWith(".gbr"))).toBe(
    false,
  )
  expect(Object.keys(zip.files).some((name) => name.endsWith(".drl"))).toBe(
    false,
  )
})
