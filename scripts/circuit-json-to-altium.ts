import {
  parseAltiumBinaryPcbDoc,
  parseAltiumPcbDoc,
  parseAltiumPrjPcb,
  parseAltiumSchDoc,
  serializeAltiumPcbDocToBinary,
  serializeAltiumSchDocToBinary,
} from "altiumts"
import JSZip from "jszip"
import { createPcbDocument } from "./circuit-json-to-altium/create-pcb-document"
import { createSchematicDocument } from "./circuit-json-to-altium/create-schematic-document"
import {
  asNumber,
  asString,
  byType,
  sanitizeFilename,
} from "./circuit-json-to-altium/format"
import type { CircuitElement } from "./circuit-json-to-altium/types"

export async function convertCircuitJsonToAltiumZip(
  circuitJson: CircuitElement[],
  projectName: string,
): Promise<Uint8Array> {
  const safeProjectName = sanitizeFilename(projectName)
  const pcbFilename = `${safeProjectName}.PcbDoc`
  const pcbAsciiDocument = createPcbDocument(circuitJson)
  const pcbDocument = serializeAltiumPcbDocToBinary(pcbAsciiDocument)
  const sheets = byType(circuitJson, "schematic_sheet").sort(
    (a, b) => asNumber(a.sheet_index) - asNumber(b.sheet_index),
  )
  const sheetDefinitions = sheets.length > 0 ? sheets : [undefined]
  const schematicFiles = sheetDefinitions.map((sheet, index) => {
    const suffix =
      sheetDefinitions.length > 1
        ? `-${String(index + 1).padStart(2, "0")}`
        : ""
    const schematicAsciiDocument = createSchematicDocument({
      circuitJson,
      schematicSheetId: sheet ? asString(sheet.schematic_sheet_id) : undefined,
      isFirstSchematicSheet: index === 0,
    })
    return {
      filename: `${safeProjectName}${suffix}.SchDoc`,
      content: serializeAltiumSchDocToBinary(schematicAsciiDocument),
    }
  })
  const projectFilename = `${safeProjectName}.PrjPcb`
  const projectDocument = [
    "[Design]",
    `ProjectName=${safeProjectName}`,
    "",
    ...[
      { path: pcbFilename, kind: "pcb-document" },
      ...schematicFiles.map(({ filename }) => ({
        path: filename,
        kind: "schematic-document",
      })),
    ].flatMap((document, index) => [
      `[Document${index + 1}]`,
      `DocumentPath=${document.path}`,
      `DocumentKind=${document.kind}`,
      "",
    ]),
  ].join("\r\n")

  parseAltiumPcbDoc(pcbAsciiDocument, { mode: "strict" })
  parseAltiumBinaryPcbDoc(pcbDocument)
  for (const schematic of schematicFiles) {
    parseAltiumSchDoc(schematic.content)
  }
  parseAltiumPrjPcb(projectDocument)

  const zip = new JSZip()
  zip.file(projectFilename, projectDocument)
  zip.file(pcbFilename, pcbDocument)
  for (const schematic of schematicFiles) {
    zip.file(schematic.filename, schematic.content)
  }
  zip.file(
    "README.txt",
    [
      `${projectName} — Altium Designer project`,
      "",
      "Generated in Altium's native binary document format from the board's routed Circuit JSON.",
      `Open ${projectFilename} in Altium Designer.`,
    ].join("\r\n"),
  )

  return zip.generateAsync({ type: "uint8array" })
}
