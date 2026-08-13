import { expect, test } from "bun:test"
import { convertCircuitJsonToAltiumZip } from "circuit-json-to-altium"
import JSZip from "jszip"

test("generates Altium archives through the dedicated converter package", async () => {
  const archiveBytes = await convertCircuitJsonToAltiumZip(
    [
      {
        type: "pcb_board",
        center: { x: 0, y: 0 },
        width: 20,
        height: 12,
      },
    ],
    "integration-board",
  )
  const archive = await JSZip.loadAsync(archiveBytes)
  const filenames = Object.keys(archive.files).sort()

  expect(filenames).toContain("integration-board.PrjPcb")
  expect(filenames).toContain("integration-board.PcbDoc")
  expect(filenames).toContain("integration-board.SchDoc")
})
