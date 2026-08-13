import { expect, test } from "bun:test"
import {
  type CircuitElement,
  board,
  expectValidPcb,
  extractArchive,
} from "./fixtures"

test("exports layer transitions without zero-length tracks and assigns vias", async () => {
  const elements: CircuitElement[] = [
    board(),
    {
      type: "source_trace",
      source_trace_id: "st1",
      connected_source_port_ids: [],
      name: "SIGNAL",
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pt1",
      source_trace_id: "st1",
      route: [
        { route_type: "wire", layer: "top", x: 0, y: 0, width: 0.2 },
        { route_type: "via", x: 0, y: 0 },
        { route_type: "wire", layer: "bottom", x: 0, y: 0, width: 0.3 },
        { route_type: "wire", layer: "bottom", x: 2, y: 0, width: 0.3 },
        { route_type: "via", x: 2, y: 0 },
        { route_type: "wire", layer: "top", x: 2, y: 0, width: 0.4 },
        { route_type: "wire", layer: "top", x: 3, y: 0, width: 0.4 },
      ],
    },
    {
      type: "pcb_via",
      pcb_via_id: "via1",
      pcb_trace_id: "pt1",
      x: 0,
      y: 0,
      outer_diameter: 0.7,
      hole_diameter: 0.35,
    },
    {
      type: "pcb_via",
      pcb_via_id: "via2",
      source_trace_id: "st1",
      x: 2,
      y: 0,
    },
  ]

  const { pcb } = await extractArchive(elements)
  const tracks = pcb.getRecordsByKind("Track")
  const vias = pcb.getRecordsByKind("Via")

  expect(tracks).toHaveLength(2)
  expect(tracks.map((track) => track.get("LAYER"))).toEqual(["BOTTOM", "TOP"])
  expect(tracks.every((track) => track.get("X1") !== track.get("X2"))).toBe(
    true,
  )
  expect(vias).toHaveLength(2)
  expect(
    [...tracks, ...vias].map((record) => pcb.getNetForRecord(record)?.name),
  ).toEqual(["SIGNAL", "SIGNAL", "SIGNAL", "SIGNAL"])
  expectValidPcb(pcb)
})
