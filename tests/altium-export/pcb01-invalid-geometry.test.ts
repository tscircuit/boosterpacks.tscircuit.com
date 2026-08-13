import { expect, test } from "bun:test"
import {
  board,
  expectValidPcb,
  extractArchive,
  pcbComponent,
  sourceComponent,
} from "./fixtures"

test("falls back to a finite rectangular board for invalid geometry", async () => {
  const result = await extractArchive([
    board({
      center: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      width: -1,
      height: 0,
      outline: [
        { x: 0, y: 0 },
        { x: Number.NaN, y: 2 },
        { x: 2, y: 0 },
      ],
    }),
    sourceComponent("sc1", "U1"),
    pcbComponent({
      pcbComponentId: "pc1",
      sourceComponentId: "sc1",
      overrides: {
        center: { x: Number.NaN, y: 0 },
        width: -5,
        height: 0,
      },
    }),
  ])

  expect(result.pcbSource).not.toMatch(/NaN|Infinity/u)
  expect(result.pcb.board?.outline.points).toHaveLength(5)
  expect(result.pcb.boardGeometry.outline.bounds).toEqual({
    minX: 1000,
    minY: 1000,
    maxX: 4937.0079,
    maxY: 4149.6063,
  })
  expect(result.pcb.components[0]?.get("PATTERN")).toBe("TSCIRCUIT-1x1mm")
  expectValidPcb(result.pcb)
})
