import { expect, test } from "bun:test"
import { getBoardSlugFromPath } from "lib/route"

test("recognizes static board detail routes", () => {
  expect(getBoardSlugFromPath("/boards/boostxl-edumkii/")).toBe(
    "boostxl-edumkii",
  )
  expect(getBoardSlugFromPath("/boards/boost-drv8848")).toBe("boost-drv8848")
  expect(getBoardSlugFromPath("/")).toBeNull()
})
