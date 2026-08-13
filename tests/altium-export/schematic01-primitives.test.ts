import { expect, test } from "bun:test"
import type { AltiumSchDoc } from "altiumts"
import {
  type CircuitElement,
  board,
  expectValidSchematic,
  extractArchive,
  sourceComponent,
  sourcePort,
} from "./fixtures"

test("preserves symbols, pins, wires, labels, and unique junctions", async () => {
  const elements: CircuitElement[] = [
    board(),
    sourceComponent("sc1", "R|1\nMAIN"),
    sourcePort({
      sourcePortId: "sp1",
      sourceComponentId: "sc1",
      pinNumber: 1,
    }),
    sourcePort({
      sourcePortId: "sp2",
      sourceComponentId: "sc1",
      pinNumber: 2,
    }),
    {
      type: "schematic_component",
      schematic_component_id: "schc1",
      source_component_id: "sc1",
      center: { x: 0, y: 0 },
      size: { width: 2, height: 1 },
      symbol_name: "box|resistor",
      symbol_display_value: "10k|Ω",
    },
    {
      type: "schematic_port",
      schematic_port_id: "schp1",
      schematic_component_id: "schc1",
      source_port_id: "sp1",
      center: { x: -1, y: 0 },
      facing_direction: "left",
    },
    {
      type: "schematic_port",
      schematic_port_id: "schp2",
      schematic_component_id: "schc1",
      source_port_id: "sp2",
      center: { x: 1, y: 0 },
      facing_direction: "right",
    },
    {
      type: "schematic_trace",
      schematic_trace_id: "scht1",
      edges: [{ from: { x: -2, y: 0 }, to: { x: -1, y: 0 } }],
      junctions: [{ x: -2, y: 0 }],
    },
    {
      type: "schematic_trace",
      schematic_trace_id: "scht2",
      edges: [{ from: { x: 1, y: 0 }, to: { x: 2, y: 0 } }],
      junctions: [{ x: -2, y: 0 }],
    },
    {
      type: "schematic_net_label",
      schematic_net_label_id: "label1",
      center: { x: 10, y: 10 },
      anchor_position: { x: 2, y: 0 },
      text: "SIG|NA\nME",
    },
  ]

  const { schematics } = await extractArchive(elements)
  const schematic = schematics[0] as AltiumSchDoc
  const component = schematic.components[0]
  const owned = schematic.getOwnedRecords(
    component as NonNullable<typeof component>,
  )

  expect(component?.libraryReference).toBe("box resistor")
  expect(schematic.pins.map((pin) => pin.designator)).toEqual(["1", "2"])
  expect(schematic.wires).toHaveLength(2)
  expect(schematic.getRecordsByKind("29")).toHaveLength(1)
  expect(schematic.netLabels.map((label) => label.text)).toEqual(["SIG NA ME"])
  expect(
    owned.find((record) => record.get("NAME") === "Designator")?.get("TEXT"),
  ).toBe("R 1 MAIN")
  expect(
    owned
      .find((record) => record.get("NAME") === "Comment")
      ?.getDecoded("TEXT"),
  ).toBe("10k Ω")
  const label = schematic.netLabels[0]
  const wireEnd = schematic.wires[1]
  expect(label?.position).toEqual({ x: 180, y: 300 })
  expect(wireEnd?.getNumber("X2")).toBe(label?.position?.x)
  expect(wireEnd?.getNumber("Y2")).toBe(label?.position?.y)
  expectValidSchematic(schematic)
})
