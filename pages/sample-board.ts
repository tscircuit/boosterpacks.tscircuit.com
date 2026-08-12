import type { BoosterBoard } from "lib/board-types"

export const sampleBoard: BoosterBoard = {
  slug: "boostxl-edumkii",
  name: "Educational BoosterPack MKII",
  description:
    "A sensor-rich learning board with a display, joystick, environmental sensing, motion sensing, audio, lighting, and a servo connection.",
  tags: ["education", "sensors", "display", "LaunchPad"],
  githubUrl: "https://github.com/tscircuit/boosters/tree/main/boostxl-edumkii",
  sourceCommit: "development",
  assets: {
    glb: "/boards/boostxl-edumkii/board.glb",
    thumbnail: "/boards/boostxl-edumkii/thumbnail.png",
    pcbSvg: "/boards/boostxl-edumkii/pcb.svg",
    schematicSvg: "/boards/boostxl-edumkii/schematic.svg",
  },
}
