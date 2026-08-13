import { describe, expect, test } from "bun:test"
import {
  type AltiumPcbDoc,
  type AltiumSchDoc,
  getDanglingPcbReferences,
  parseAltiumPcbDoc,
  parseAltiumPrjPcb,
  parseAltiumSchDoc,
  validateAltiumDocument,
} from "altiumts"
import JSZip from "jszip"
import { convertCircuitJsonToAltiumZip } from "../scripts/circuit-json-to-altium"

type CircuitElement = Record<string, unknown> & { type: string }

const board = (overrides: Record<string, unknown> = {}): CircuitElement => ({
  type: "pcb_board",
  center: { x: 0, y: 0 },
  width: 20,
  height: 12,
  ...overrides,
})

const sourceComponent = (id: string, name: string): CircuitElement => ({
  type: "source_component",
  source_component_id: id,
  name,
})

const sourcePort = (
  id: string,
  componentId: string,
  pinNumber: number,
): CircuitElement => ({
  type: "source_port",
  source_port_id: id,
  source_component_id: componentId,
  pin_number: pinNumber,
  name: `pin${pinNumber}`,
})

const pcbComponent = (
  id: string,
  sourceId: string,
  overrides: Record<string, unknown> = {},
): CircuitElement => ({
  type: "pcb_component",
  pcb_component_id: id,
  source_component_id: sourceId,
  center: { x: 0, y: 0 },
  width: 2,
  height: 1,
  layer: "top",
  rotation: 0,
  ...overrides,
})

const pcbPort = (
  id: string,
  sourceId: string,
  componentId: string,
): CircuitElement => ({
  type: "pcb_port",
  pcb_port_id: id,
  source_port_id: sourceId,
  pcb_component_id: componentId,
})

const extractArchive = async (
  elements: CircuitElement[],
  projectName = "example-board",
) => {
  const zip = await JSZip.loadAsync(
    await convertCircuitJsonToAltiumZip(elements, projectName),
  )
  const filenames = Object.keys(zip.files).sort()
  const projectFilename = filenames.find((name) => name.endsWith(".PrjPcb"))
  const pcbFilename = filenames.find((name) => name.endsWith(".PcbDoc"))
  const schematicFilenames = filenames.filter((name) =>
    name.endsWith(".SchDoc"),
  )
  if (!projectFilename || !pcbFilename || schematicFilenames.length === 0) {
    throw new Error(`Incomplete Altium archive: ${filenames.join(", ")}`)
  }
  const projectSource = await zip.file(projectFilename)?.async("string")
  const pcbSource = await zip.file(pcbFilename)?.async("string")
  if (!projectSource || !pcbSource) throw new Error("Unreadable Altium archive")
  const project = parseAltiumPrjPcb(projectSource)
  const pcb = parseAltiumPcbDoc(pcbSource, { mode: "strict" })
  const schematicSources = await Promise.all(
    schematicFilenames.map(async (filename) => {
      const source = await zip.file(filename)?.async("string")
      if (!source) throw new Error(`Unreadable schematic ${filename}`)
      return { filename, source }
    }),
  )
  const schematics = schematicSources.map(({ source }) =>
    parseAltiumSchDoc(source),
  )
  return {
    filenames,
    pcbSource,
    project,
    projectFilename,
    schematicSources,
    pcb,
    schematics,
    zip,
  }
}

const expectValidPcb = (pcb: AltiumPcbDoc) => {
  expect(validateAltiumDocument(pcb, { profile: "strict" }).valid).toBe(true)
  expect(getDanglingPcbReferences(pcb)).toEqual([])
}

const expectValidSchematic = (schematic: AltiumSchDoc) => {
  expect(validateAltiumDocument(schematic, { profile: "strict" }).valid).toBe(
    true,
  )
  expect(schematic.index.getOwnershipCycles()).toEqual([])
}

describe("circuit-json-to-altium archive", () => {
  test("creates a parseable project with a connected PCB and schematic", async () => {
    const elements: CircuitElement[] = [
      board(),
      sourceComponent("sc1", "R1"),
      sourcePort("sp1", "sc1", 1),
      {
        type: "source_trace",
        source_trace_id: "st1",
        connected_source_port_ids: ["sp1"],
        name: "SIGNAL",
      },
      pcbComponent("pc1", "sc1"),
      pcbPort("pp1", "sp1", "pc1"),
      {
        type: "pcb_smtpad",
        pcb_smtpad_id: "pad1",
        pcb_component_id: "pc1",
        pcb_port_id: "pp1",
        shape: "rect",
        x: -0.5,
        y: 0,
        width: 0.8,
        height: 0.8,
        layer: "top",
      },
      {
        type: "schematic_component",
        schematic_component_id: "schc1",
        source_component_id: "sc1",
        center: { x: 0, y: 0 },
        size: { width: 2, height: 1 },
        symbol_name: "boxresistor",
        symbol_display_value: "10kΩ",
      },
      {
        type: "schematic_port",
        schematic_port_id: "schp1",
        schematic_component_id: "schc1",
        source_port_id: "sp1",
        center: { x: -1.5, y: 0 },
        facing_direction: "left",
      },
      {
        type: "schematic_trace",
        schematic_trace_id: "scht1",
        source_trace_id: "st1",
        edges: [{ from: { x: -2.5, y: 0 }, to: { x: -1.5, y: 0 } }],
        junctions: [],
      },
    ]

    const result = await extractArchive(elements)

    expect(result.filenames).toEqual([
      "README.txt",
      "example-board.PcbDoc",
      "example-board.PrjPcb",
      "example-board.SchDoc",
    ])
    expect(result.project.documents).toHaveLength(2)
    expect(result.pcb.components[0]?.get("SOURCEDESIGNATOR")).toBe("R1")
    expect(result.pcb.getRecordsByKind("Pad")).toHaveLength(1)
    expect(result.pcb.nets.map((net) => net.name)).toEqual(["SIGNAL"])
    expect(result.schematics[0]?.components).toHaveLength(1)
    expect(result.schematics[0]?.pins).toHaveLength(1)
    expect(result.schematics[0]?.wires).toHaveLength(1)
    expect(result.schematics[0]?.components[0]?.libraryReference).toBe(
      "boxresistor",
    )
    expectValidPcb(result.pcb)
    expectValidSchematic(result.schematics[0] as AltiumSchDoc)
  })

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

  test("falls back to a finite rectangular board for invalid geometry", async () => {
    const result = await extractArchive([
      board({
        center: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
        width: -1,
        height: 0,
        outline: [
          { x: 0, y: 0 },
          { x: Number.NaN, y: 2 },
          { x: 2, y: 0 },
        ],
      }),
      sourceComponent("sc1", "U1"),
      pcbComponent("pc1", "sc1", {
        center: { x: Number.NaN, y: 0 },
        width: -5,
        height: 0,
      }),
    ])

    expect(result.pcbSource).not.toMatch(/NaN|Infinity/u)
    expect(result.pcb.board?.outline.points).toHaveLength(5)
    expect(result.pcb.boardGeometry.outline.bounds).toEqual({
      minX: 1000,
      minY: 1000,
      maxX: 4937.0079,
      maxY: 4149.6063,
    })
    expect(result.pcb.components[0]?.get("PATTERN")).toBe("TSCIRCUIT-1x1mm")
    expectValidPcb(result.pcb)
  })

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
})

describe("PCB connectivity and primitives", () => {
  test("merges traces transitively by shared source nets and ports", async () => {
    const elements: CircuitElement[] = [
      board(),
      { type: "source_net", source_net_id: "gnd", name: "GND" },
      sourceComponent("sc1", "J1"),
      ...[1, 2, 3, 4, 5].map((pin) => sourcePort(`sp${pin}`, "sc1", pin)),
      {
        type: "source_trace",
        source_trace_id: "st1",
        connected_source_port_ids: ["sp1"],
        connected_source_net_ids: ["gnd"],
        display_name: "first ground branch",
      },
      {
        type: "source_trace",
        source_trace_id: "st2",
        connected_source_port_ids: ["sp2"],
        connected_source_net_ids: ["gnd"],
      },
      {
        type: "source_trace",
        source_trace_id: "st3",
        connected_source_port_ids: ["sp2", "sp3"],
      },
      {
        type: "source_trace",
        source_trace_id: "st4",
        connected_source_port_ids: ["sp4"],
        name: "DATA",
      },
      {
        type: "source_trace",
        source_trace_id: "st5",
        connected_source_port_ids: ["sp5"],
        name: "DATA",
      },
      pcbComponent("pc1", "sc1"),
      ...[1, 2, 3, 4, 5].flatMap((pin) => [
        pcbPort(`pp${pin}`, `sp${pin}`, "pc1"),
        {
          type: "pcb_smtpad",
          pcb_smtpad_id: `pad${pin}`,
          pcb_component_id: "pc1",
          pcb_port_id: `pp${pin}`,
          shape: "rect",
          x: pin,
          y: 0,
          width: 0.5,
          height: 0.5,
          layer: "top",
        },
      ]),
    ]

    const { pcb } = await extractArchive(elements)
    const pads = pcb.getRecordsByKind("Pad")

    expect(pcb.nets.map((net) => net.name)).toEqual(["GND", "DATA", "DATA-2"])
    expect(
      pads.slice(0, 3).map((pad) => pcb.getNetForRecord(pad)?.name),
    ).toEqual(["GND", "GND", "GND"])
    expect(pads.slice(3).map((pad) => pcb.getNetForRecord(pad)?.name)).toEqual([
      "DATA",
      "DATA-2",
    ])
    expectValidPcb(pcb)
  })

  test("exports SMT, plated slots, and non-plated holes with ownership", async () => {
    const elements: CircuitElement[] = [
      board(),
      sourceComponent("sc1", "J1"),
      sourcePort("sp1", "sc1", 1),
      sourcePort("sp2", "sc1", 2),
      {
        type: "source_trace",
        source_trace_id: "st1",
        connected_source_port_ids: ["sp1", "sp2"],
        name: "IO",
      },
      pcbComponent("pc1", "sc1", {
        layer: "bottom",
        rotation: 270,
      }),
      pcbPort("pp1", "sp1", "pc1"),
      pcbPort("pp2", "sp2", "pc1"),
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
    expect(
      pcb.getComponentForRecord(plated as NonNullable<typeof plated>),
    ).toBe(pcb.components[0])
    expect(nonPlated?.get("PLATED")).toBe("FALSE")
    expect(nonPlated?.get("HOLESHAPE")).toBe("SLOT")
    expect(nonPlated?.get("NAME")).toBe("NPTH-1")
    expect(
      pcb.getNetForRecord(nonPlated as NonNullable<typeof nonPlated>),
    ).toBe(undefined)
    expectValidPcb(pcb)
  })

  test("exports layer transitions without zero-length tracks and assigns vias", async () => {
    const elements: CircuitElement[] = [
      board(),
      {
        type: "source_trace",
        source_trace_id: "st1",
        connected_source_port_ids: [],
        name: "SIGNAL",
      },
      {
        type: "pcb_trace",
        pcb_trace_id: "pt1",
        source_trace_id: "st1",
        route: [
          { route_type: "wire", layer: "top", x: 0, y: 0, width: 0.2 },
          { route_type: "via", x: 0, y: 0 },
          { route_type: "wire", layer: "bottom", x: 0, y: 0, width: 0.3 },
          { route_type: "wire", layer: "bottom", x: 2, y: 0, width: 0.3 },
          { route_type: "via", x: 2, y: 0 },
          { route_type: "wire", layer: "top", x: 2, y: 0, width: 0.4 },
          { route_type: "wire", layer: "top", x: 3, y: 0, width: 0.4 },
        ],
      },
      {
        type: "pcb_via",
        pcb_via_id: "via1",
        pcb_trace_id: "pt1",
        x: 0,
        y: 0,
        outer_diameter: 0.7,
        hole_diameter: 0.35,
      },
      {
        type: "pcb_via",
        pcb_via_id: "via2",
        source_trace_id: "st1",
        x: 2,
        y: 0,
      },
    ]

    const { pcb } = await extractArchive(elements)
    const tracks = pcb.getRecordsByKind("Track")
    const vias = pcb.getRecordsByKind("Via")

    expect(tracks).toHaveLength(2)
    expect(tracks.map((track) => track.get("LAYER"))).toEqual(["BOTTOM", "TOP"])
    expect(tracks.every((track) => track.get("X1") !== track.get("X2"))).toBe(
      true,
    )
    expect(vias).toHaveLength(2)
    expect(
      [...tracks, ...vias].map((record) => pcb.getNetForRecord(record)?.name),
    ).toEqual(["SIGNAL", "SIGNAL", "SIGNAL", "SIGNAL"])
    expectValidPcb(pcb)
  })

  test("exports top and bottom silkscreen paths and text", async () => {
    const elements: CircuitElement[] = [
      board(),
      sourceComponent("sc1", "U1"),
      pcbComponent("pc1", "sc1"),
      {
        type: "pcb_silkscreen_path",
        pcb_silkscreen_path_id: "silk1",
        pcb_component_id: "pc1",
        layer: "top",
        route: [
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 0 },
        ],
        stroke_width: 0.12,
      },
      {
        type: "pcb_silkscreen_text",
        pcb_silkscreen_text_id: "text1",
        pcb_component_id: "pc1",
        layer: "bottom",
        anchor_position: { x: 0, y: -2 },
        text: "U1|BOTTOM\nLABEL",
        font_size: 0.8,
        ccw_rotation: 90,
      },
    ]

    const { pcb } = await extractArchive(elements)
    const silkTracks = pcb.getRecordsByKind("Track")
    const text = pcb.getRecordsByKind("Text")[0]

    expect(silkTracks).toHaveLength(2)
    expect(
      silkTracks.every((track) => track.get("LAYER") === "TOPOVERLAY"),
    ).toBe(true)
    expect(silkTracks.every((track) => track.get("COMPONENT") === "0")).toBe(
      true,
    )
    expect(text?.get("LAYER")).toBe("BOTTOMOVERLAY")
    expect(text?.get("MIRROR")).toBe("TRUE")
    expect(text?.get("TEXT")).toBe("U1 BOTTOM LABEL")
    expect(text?.get("ROTATION")).toBe("90")
    expectValidPcb(pcb)
  })
})

describe("schematic export", () => {
  test("preserves symbols, pins, wires, labels, and unique junctions", async () => {
    const elements: CircuitElement[] = [
      board(),
      sourceComponent("sc1", "R|1\nMAIN"),
      sourcePort("sp1", "sc1", 1),
      sourcePort("sp2", "sc1", 2),
      {
        type: "schematic_component",
        schematic_component_id: "schc1",
        source_component_id: "sc1",
        center: { x: 0, y: 0 },
        size: { width: 2, height: 1 },
        symbol_name: "box|resistor",
        symbol_display_value: "10k|Ω",
      },
      {
        type: "schematic_port",
        schematic_port_id: "schp1",
        schematic_component_id: "schc1",
        source_port_id: "sp1",
        center: { x: -1, y: 0 },
        facing_direction: "left",
      },
      {
        type: "schematic_port",
        schematic_port_id: "schp2",
        schematic_component_id: "schc1",
        source_port_id: "sp2",
        center: { x: 1, y: 0 },
        facing_direction: "right",
      },
      {
        type: "schematic_trace",
        schematic_trace_id: "scht1",
        edges: [{ from: { x: -2, y: 0 }, to: { x: -1, y: 0 } }],
        junctions: [{ x: -2, y: 0 }],
      },
      {
        type: "schematic_trace",
        schematic_trace_id: "scht2",
        edges: [{ from: { x: 1, y: 0 }, to: { x: 2, y: 0 } }],
        junctions: [{ x: -2, y: 0 }],
      },
      {
        type: "schematic_net_label",
        schematic_net_label_id: "label1",
        center: { x: 10, y: 10 },
        anchor_position: { x: 2, y: 0 },
        text: "SIG|NA\nME",
      },
    ]

    const { schematics } = await extractArchive(elements)
    const schematic = schematics[0] as AltiumSchDoc
    const component = schematic.components[0]
    const owned = schematic.getOwnedRecords(
      component as NonNullable<typeof component>,
    )

    expect(component?.libraryReference).toBe("box resistor")
    expect(schematic.pins.map((pin) => pin.designator)).toEqual(["1", "2"])
    expect(schematic.wires).toHaveLength(2)
    expect(schematic.getRecordsByKind("29")).toHaveLength(1)
    expect(schematic.netLabels.map((label) => label.text)).toEqual([
      "SIG NA ME",
    ])
    expect(
      owned.find((record) => record.get("NAME") === "Designator")?.get("TEXT"),
    ).toBe("R 1 MAIN")
    expect(
      owned.find((record) => record.get("NAME") === "Comment")?.get("TEXT"),
    ).toBe("10k Ω")
    const label = schematic.netLabels[0]
    const wireEnd = schematic.wires[1]
    expect(label?.position).toEqual({ x: 180, y: 300 })
    expect(wireEnd?.getNumber("X2")).toBe(label?.position?.x)
    expect(wireEnd?.getNumber("Y2")).toBe(label?.position?.y)
    expectValidSchematic(schematic)
  })

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
})

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
