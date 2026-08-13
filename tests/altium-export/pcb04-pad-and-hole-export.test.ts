import { expect, test } from "bun:test"
import {
  type CircuitElement,
  board,
  expectValidPcb,
  extractArchive,
  pcbComponent,
  pcbPort,
  sourceComponent,
  sourcePort,
} from "./fixtures"

test("exports SMT, plated slots, and non-plated holes with ownership", async () => {
  const elements: CircuitElement[] = [
    board(),
    sourceComponent("sc1", "J1"),
    sourcePort({
      sourcePortId: "sp1",
      sourceComponentId: "sc1",
      pinNumber: 1,
    }),
    sourcePort({
      sourcePortId: "sp2",
      sourceComponentId: "sc1",
      pinNumber: 2,
    }),
    {
      type: "source_trace",
      source_trace_id: "st1",
      connected_source_port_ids: ["sp1", "sp2"],
      name: "IO",
    },
    pcbComponent({
      pcbComponentId: "pc1",
      sourceComponentId: "sc1",
      overrides: { layer: "bottom", rotation: 270 },
    }),
    pcbPort({
      pcbPortId: "pp1",
      sourcePortId: "sp1",
      pcbComponentId: "pc1",
    }),
    pcbPort({
      pcbPortId: "pp2",
      sourcePortId: "sp2",
      pcbComponentId: "pc1",
    }),
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad1",
      pcb_component_id: "pc1",
      pcb_port_id: "pp1",
      shape: "circle",
      radius: 0.4,
      x: -1,
      y: 0,
      layer: "bottom",
      ccw_rotation: 45,
    },
    {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: "pth1",
      pcb_component_id: "pc1",
      pcb_port_id: "pp2",
      shape: "pill",
      outer_width: 1.4,
      outer_height: 2,
      hole_width: 0.6,
      hole_height: 1.2,
      ccw_rotation: 90,
      x: 1,
      y: 0,
    },
    {
      type: "pcb_hole",
      pcb_hole_id: "hole1",
      pcb_component_id: "pc1",
      hole_shape: "pill",
      hole_width: 0.8,
      hole_height: 1.6,
      ccw_rotation: 30,
      x: 0,
      y: 2,
    },
  ]

  const { pcb } = await extractArchive(elements)
  const [smt, plated, nonPlated] = pcb.getRecordsByKind("Pad")

  expect(pcb.components[0]?.get("LAYER")).toBe("BOTTOM")
  expect(pcb.components[0]?.get("SOURCEDESIGNATOR")).toBe("J1")
  expect(smt?.get("LAYER")).toBe("BOTTOM")
  expect(smt?.get("SHAPE")).toBe("ROUND")
  expect(smt?.getAltiumMeasurement("XSIZE")?.toMillimeters()).toBeCloseTo(
    0.8,
    4,
  )
  expect(plated?.get("PLATED")).toBe("TRUE")
  expect(plated?.get("HOLESHAPE")).toBe("SLOT")
  expect(plated?.get("HOLEROTATION")).toBe("90")
  expect(pcb.getComponentForRecord(plated as NonNullable<typeof plated>)).toBe(
    pcb.components[0],
  )
  expect(nonPlated?.get("PLATED")).toBe("FALSE")
  expect(nonPlated?.get("HOLESHAPE")).toBe("SLOT")
  expect(nonPlated?.get("NAME")).toBe("NPTH-1")
  expect(pcb.getNetForRecord(nonPlated as NonNullable<typeof nonPlated>)).toBe(
    undefined,
  )
  expectValidPcb(pcb)
})
