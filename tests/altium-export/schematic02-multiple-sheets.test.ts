import { expect, test } from "bun:test"
import {
  type CircuitElement,
  board,
  expectValidSchematic,
  extractArchive,
  sourceComponent,
} from "./fixtures"

test("sorts multiple sheets and puts unassigned records on the first sheet", async () => {
  const elements: CircuitElement[] = [
    board(),
    {
      type: "schematic_sheet",
      schematic_sheet_id: "sheet-b",
      sheet_index: 20,
    },
    {
      type: "schematic_sheet",
      schematic_sheet_id: "sheet-a",
      sheet_index: 10,
    },
    sourceComponent("sc-a", "A1"),
    sourceComponent("sc-b", "B1"),
    sourceComponent("sc-free", "FREE1"),
    {
      type: "schematic_component",
      schematic_component_id: "sch-a",
      schematic_sheet_id: "sheet-a",
      source_component_id: "sc-a",
      center: { x: 0, y: 0 },
    },
    {
      type: "schematic_component",
      schematic_component_id: "sch-b",
      schematic_sheet_id: "sheet-b",
      source_component_id: "sc-b",
      center: { x: 0, y: 0 },
    },
    {
      type: "schematic_component",
      schematic_component_id: "sch-free",
      source_component_id: "sc-free",
      center: { x: 2, y: 0 },
    },
  ]

  const result = await extractArchive(elements, "multi")

  expect(result.schematicSources.map(({ filename }) => filename)).toEqual([
    "multi-01.SchDoc",
    "multi-02.SchDoc",
  ])
  expect(result.project.documents).toHaveLength(3)
  expect(
    result.schematics[0]?.components.map((component) =>
      component.get("UNIQUEID"),
    ),
  ).toEqual(["sch-a", "sch-free"])
  expect(
    result.schematics[1]?.components.map((component) =>
      component.get("UNIQUEID"),
    ),
  ).toEqual(["sch-b"])
  for (const schematic of result.schematics) expectValidSchematic(schematic)
})
