import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  extractReadmeMetadata,
  humanizeSlug,
  inferTags,
} from "../scripts/generate-board-assets"

describe("BoosterPack metadata", () => {
  test("extracts a title and summary from a board README", async () => {
    const markdown = await readFile(
      join(import.meta.dir, "fixtures", "booster-readme.md"),
      "utf8",
    )
    const metadata = extractReadmeMetadata(markdown, "boostxl-example")

    expect(metadata).toEqual({
      title: "BOOSTXL-EXAMPLE Sensor BoosterPack",
      description:
        "This example BoosterPack combines a temperature sensor, motion sensing, and a compact LaunchPad interface for classroom experiments.",
    })
  })

  test("falls back to a readable slug title", () => {
    expect(humanizeSlug("boost-drv8848")).toBe("BOOST-DRV8848")
  })

  test("infers useful search tags without duplicates", () => {
    const tags = inferTags(
      "boostxl-example",
      "Sensor board",
      "A temperature and motion sensor for education",
    )

    expect(tags).toEqual([
      "temperature",
      "motion sensing",
      "education",
      "sensors",
    ])
  })
})
