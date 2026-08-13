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

let randomSeed = 0x5eed1234

function getNextRandomNumber(): number {
  randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0
  return randomSeed / 0x1_0000_0000
}

test("randomized sparse inputs always produce strict-parseable documents", async () => {
  for (let caseIndex = 0; caseIndex < 20; caseIndex++) {
    const componentCount = 1 + Math.floor(getNextRandomNumber() * 5)
    const elements: CircuitElement[] = [
      board({
        center: {
          x: getNextRandomNumber() * 20 - 10,
          y: getNextRandomNumber() * 20 - 10,
        },
        width: 5 + getNextRandomNumber() * 50,
        height: 5 + getNextRandomNumber() * 50,
      }),
    ]
    for (let index = 0; index < componentCount; index++) {
      const sourceComponentId = `sc-${caseIndex}-${index}`
      const pcbComponentId = `pc-${caseIndex}-${index}`
      const sourcePortId = `sp-${caseIndex}-${index}`
      const pcbPortId = `pp-${caseIndex}-${index}`
      elements.push(
        sourceComponent(sourceComponentId, `U${index + 1}`),
        sourcePort({
          sourcePortId,
          sourceComponentId,
          pinNumber: index + 1,
        }),
        {
          type: "source_trace",
          source_trace_id: `st-${caseIndex}-${index}`,
          connected_source_port_ids: [sourcePortId],
          name: `NET-${index + 1}`,
        },
        pcbComponent({
          pcbComponentId,
          sourceComponentId,
          overrides: {
            center: {
              x: getNextRandomNumber() * 10 - 5,
              y: getNextRandomNumber() * 10 - 5,
            },
            width: 0.5 + getNextRandomNumber() * 5,
            height: 0.5 + getNextRandomNumber() * 5,
            layer: getNextRandomNumber() > 0.5 ? "top" : "bottom",
            rotation: Math.floor(getNextRandomNumber() * 4) * 90,
          },
        }),
        pcbPort({ pcbPortId, sourcePortId, pcbComponentId }),
        {
          type: "pcb_smtpad",
          pcb_smtpad_id: `pad-${caseIndex}-${index}`,
          pcb_component_id: pcbComponentId,
          pcb_port_id: pcbPortId,
          shape: getNextRandomNumber() > 0.5 ? "circle" : "rect",
          x: getNextRandomNumber() * 10 - 5,
          y: getNextRandomNumber() * 10 - 5,
          width: 0.2 + getNextRandomNumber(),
          height: 0.2 + getNextRandomNumber(),
          layer: getNextRandomNumber() > 0.5 ? "top" : "bottom",
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
