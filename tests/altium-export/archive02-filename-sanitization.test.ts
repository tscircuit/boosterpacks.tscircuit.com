import { expect, test } from "bun:test"
import { board, extractArchive } from "./fixtures"

test("sanitizes project paths and reserved filenames", async () => {
  const result = await extractArchive([board()], "../CON<>")

  expect(result.projectFilename).toBe("board-CON.PrjPcb")
  expect(result.filenames).toEqual([
    "README.txt",
    "board-CON.PcbDoc",
    "board-CON.PrjPcb",
    "board-CON.SchDoc",
  ])
  expect(result.project.documents.map((document) => document.path)).toEqual([
    "board-CON.PcbDoc",
    "board-CON.SchDoc",
  ])
})
