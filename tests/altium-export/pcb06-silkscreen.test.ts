import { expect, test } from "bun:test"
import {
  type CircuitElement,
  board,
  expectValidPcb,
  extractArchive,
  pcbComponent,
  sourceComponent,
} from "./fixtures"

test("exports top and bottom silkscreen paths and text", async () => {
  const elements: CircuitElement[] = [
    board(),
    sourceComponent("sc1", "U1"),
    pcbComponent({ pcbComponentId: "pc1", sourceComponentId: "sc1" }),
    {
      type: "pcb_silkscreen_path",
      pcb_silkscreen_path_id: "silk1",
      pcb_component_id: "pc1",
      layer: "top",
      route: [
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ],
      stroke_width: 0.12,
    },
    {
      type: "pcb_silkscreen_text",
      pcb_silkscreen_text_id: "text1",
      pcb_component_id: "pc1",
      layer: "bottom",
      anchor_position: { x: 0, y: -2 },
      text: "U1|BOTTOM\nLABEL",
      font_size: 0.8,
      ccw_rotation: 90,
    },
  ]

  const { pcb } = await extractArchive(elements)
  const silkTracks = pcb.getRecordsByKind("Track")
  const text = pcb.getRecordsByKind("Text")[0]

  expect(silkTracks).toHaveLength(2)
  expect(silkTracks.every((track) => track.get("LAYER") === "TOPOVERLAY")).toBe(
    true,
  )
  expect(silkTracks.every((track) => track.get("COMPONENT") === "0")).toBe(true)
  expect(text?.get("LAYER")).toBe("BOTTOMOVERLAY")
  expect(text?.get("MIRROR")).toBe("TRUE")
  expect(text?.get("TEXT")).toBe("U1 BOTTOM LABEL")
  expect(text?.get("ROTATION")).toBe("90")
  expectValidPcb(pcb)
})
