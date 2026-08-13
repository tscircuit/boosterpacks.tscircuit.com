import { expect, test } from "bun:test"
import type { AltiumSchDoc } from "altiumts"
import {
  type CircuitElement,
  board,
  expectValidPcb,
  expectValidSchematic,
  extractArchive,
  pcbComponent,
  pcbPort,
  sourceComponent,
  sourcePort,
} from "./fixtures"

test("randomized sparse inputs always produce strict-parseable documents", async () => {
  let seed = 0x5eed1234
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x1_0000_0000
  }

  for (let caseIndex = 0; caseIndex < 20; caseIndex++) {
    const componentCount = 1 + Math.floor(random() * 5)
    const elements: CircuitElement[] = [
      board({
        center: { x: random() * 20 - 10, y: random() * 20 - 10 },
        width: 5 + random() * 50,
        height: 5 + random() * 50,
      }),
    ]
    for (let index = 0; index < componentCount; index++) {
      const sourceId = `sc-${caseIndex}-${index}`
      const componentId = `pc-${caseIndex}-${index}`
      const sourcePortId = `sp-${caseIndex}-${index}`
      const pcbPortId = `pp-${caseIndex}-${index}`
      elements.push(
        sourceComponent(sourceId, `U${index + 1}`),
        sourcePort(sourcePortId, sourceId, index + 1),
        {
          type: "source_trace",
          source_trace_id: `st-${caseIndex}-${index}`,
          connected_source_port_ids: [sourcePortId],
          name: `NET-${index + 1}`,
        },
        pcbComponent(componentId, sourceId, {
          center: { x: random() * 10 - 5, y: random() * 10 - 5 },
          width: 0.5 + random() * 5,
          height: 0.5 + random() * 5,
          layer: random() > 0.5 ? "top" : "bottom",
          rotation: Math.floor(random() * 4) * 90,
        }),
        pcbPort(pcbPortId, sourcePortId, componentId),
        {
          type: "pcb_smtpad",
          pcb_smtpad_id: `pad-${caseIndex}-${index}`,
          pcb_component_id: componentId,
          pcb_port_id: pcbPortId,
          shape: random() > 0.5 ? "circle" : "rect",
          x: random() * 10 - 5,
          y: random() * 10 - 5,
          width: 0.2 + random(),
          height: 0.2 + random(),
          layer: random() > 0.5 ? "top" : "bottom",
        },
      )
    }

    const result = await extractArchive(elements, `fuzz-${caseIndex}`)
    expect(result.pcb.components).toHaveLength(componentCount)
    expect(result.pcb.getRecordsByKind("Pad")).toHaveLength(componentCount)
    expect(result.pcb.nets).toHaveLength(componentCount)
    expectValidPcb(result.pcb)
    expectValidSchematic(result.schematics[0] as AltiumSchDoc)
  }
})
