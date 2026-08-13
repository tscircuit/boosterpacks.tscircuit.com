import { expect, test } from "bun:test"
import {
  type CircuitElement,
  board,
  expectValidPcb,
  extractArchive,
  pcbComponent,
  pcbPort,
  sourceComponent,
  sourcePort,
} from "./fixtures"

test("merges traces transitively by shared source nets and ports", async () => {
  const elements: CircuitElement[] = [
    board(),
    { type: "source_net", source_net_id: "gnd", name: "GND" },
    sourceComponent("sc1", "J1"),
    ...[1, 2, 3, 4, 5].map((pin) => sourcePort(`sp${pin}`, "sc1", pin)),
    {
      type: "source_trace",
      source_trace_id: "st1",
      connected_source_port_ids: ["sp1"],
      connected_source_net_ids: ["gnd"],
      display_name: "first ground branch",
    },
    {
      type: "source_trace",
      source_trace_id: "st2",
      connected_source_port_ids: ["sp2"],
      connected_source_net_ids: ["gnd"],
    },
    {
      type: "source_trace",
      source_trace_id: "st3",
      connected_source_port_ids: ["sp2", "sp3"],
    },
    {
      type: "source_trace",
      source_trace_id: "st4",
      connected_source_port_ids: ["sp4"],
      name: "DATA",
    },
    {
      type: "source_trace",
      source_trace_id: "st5",
      connected_source_port_ids: ["sp5"],
      name: "DATA",
    },
    pcbComponent("pc1", "sc1"),
    ...[1, 2, 3, 4, 5].flatMap((pin) => [
      pcbPort(`pp${pin}`, `sp${pin}`, "pc1"),
      {
        type: "pcb_smtpad",
        pcb_smtpad_id: `pad${pin}`,
        pcb_component_id: "pc1",
        pcb_port_id: `pp${pin}`,
        shape: "rect",
        x: pin,
        y: 0,
        width: 0.5,
        height: 0.5,
        layer: "top",
      },
    ]),
  ]

  const { pcb } = await extractArchive(elements)
  const pads = pcb.getRecordsByKind("Pad")

  expect(pcb.nets.map((net) => net.name)).toEqual(["GND", "DATA", "DATA-2"])
  expect(pads.slice(0, 3).map((pad) => pcb.getNetForRecord(pad)?.name)).toEqual(
    ["GND", "GND", "GND"],
  )
  expect(pads.slice(3).map((pad) => pcb.getNetForRecord(pad)?.name)).toEqual([
    "DATA",
    "DATA-2",
  ])
  expectValidPcb(pcb)
})
