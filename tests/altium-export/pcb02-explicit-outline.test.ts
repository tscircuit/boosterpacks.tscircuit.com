import { expect, test } from "bun:test"
import { board, extractArchive } from "./fixtures"

test("keeps a valid explicit closed outline without duplicating its closure", async () => {
  const result = await extractArchive([
    board({
      outline: [
        { x: -2, y: -1 },
        { x: 3, y: -1 },
        { x: 2, y: 2 },
        { x: -2, y: -1 },
      ],
    }),
  ])

  expect(result.pcb.board?.outline.points).toHaveLength(4)
  expect(result.pcb.boardGeometry.outline.bounds).toEqual({
    minX: 1000,
    minY: 1000,
    maxX: 1196.8504,
    maxY: 1118.1102,
  })
})
