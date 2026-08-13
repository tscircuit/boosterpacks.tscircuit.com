import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import JSZip from "jszip"
import {
  computeWorldAABB,
  createSceneFromGLTF,
  encodePNG,
  loadGLTFWithResourcesFromURL,
  renderSceneFromGLTF,
} from "poppygl"
import type { BoardManifest, BoosterBoard } from "lib/board-types"
import { convertCircuitJsonToAltiumZip } from "./circuit-json-to-altium"

const SOURCE_REPOSITORY = "https://github.com/tscircuit/boosters"
const projectRoot = resolve(import.meta.dir, "..")

export function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .map((part) => part.toUpperCase())
    .join("-")
}

export function extractReadmeMetadata(markdown: string, slug: string) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || humanizeSlug(slug)
  const paragraphs = markdown
    .replace(/^#\s+.+$/m, "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())

  const rawDescription = paragraphs.find(
    (paragraph) =>
      paragraph.length > 40 &&
      !paragraph.startsWith("#") &&
      !paragraph.startsWith("-") &&
      !paragraph.startsWith("|") &&
      !paragraph.startsWith("```") &&
      !paragraph.startsWith(">") &&
      !paragraph.startsWith("!["),
  )

  const description = cleanMarkdown(
    rawDescription ||
      `An open-source ${title} board implemented with tscircuit.`,
  )

  return { title: cleanMarkdown(title), description }
}

export function inferTags(slug: string, name: string, description: string) {
  const haystack = `${slug} ${name} ${description}`.toLowerCase()
  const matches: Array<[RegExp, string]> = [
    [/motor|drv8|h-bridge|mosfet/, "motor control"],
    [/temperature|tmp107|tmp117/, "temperature"],
    [/\bpir\b|motion/, "motion sensing"],
    [/education|edumkii|joystick|display/, "education"],
    [/sensor|sensing|accelerometer/, "sensors"],
    [/power|buck|driver/, "power electronics"],
    [/three-phase|3-phase/, "three-phase"],
  ]
  const tags = matches
    .filter(([pattern]) => pattern.test(haystack))
    .map(([, tag]) => tag)

  return [...new Set([...tags, "LaunchPad"])].slice(0, 4)
}

function cleanMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

async function runCommand(command: string[], cwd: string) {
  console.log(`\n$ ${command.join(" ")}`)
  const child = Bun.spawn(command, {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await child.exited

  if (exitCode !== 0) {
    throw new Error(`${command[0]} exited with code ${exitCode}`)
  }
}

async function pathExists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function addHierarchicalSchematicsToKicadZip(
  circuitJson: Array<Record<string, unknown> & { type?: string }>,
  outputDir: string,
  kicadZipPath: string,
) {
  const sheets = circuitJson
    .filter((element) => element.type === "schematic_sheet")
    .sort(
      (a, b) =>
        (typeof a.sheet_index === "number" ? a.sheet_index : 0) -
        (typeof b.sheet_index === "number" ? b.sheet_index : 0),
    )
  if (sheets.length === 0) return
  const zip = await JSZip.loadAsync(
    new Uint8Array(await readFile(kicadZipPath)),
  )
  const rootSchematic = await zip
    .file("board.circuit.kicad_sch")
    ?.async("string")
  if (!rootSchematic) {
    throw new Error("KiCad ZIP is missing its root schematic")
  }
  const childFilenames = [
    ...rootSchematic.matchAll(/\(property "Sheetfile" "([^"]+)"/gu),
  ].map((match) => match[1] as string)
  if (childFilenames.length !== sheets.length) {
    throw new Error(
      `KiCad ZIP references ${childFilenames.length} child schematics for ${sheets.length} sheets`,
    )
  }

  for (const [index, sheet] of sheets.entries()) {
    const sheetId =
      typeof sheet.schematic_sheet_id === "string"
        ? sheet.schematic_sheet_id
        : undefined
    const childCircuitJson = circuitJson.filter((element) => {
      if (element.type === "schematic_sheet") return false
      if (!element.type?.startsWith("schematic_")) return true
      const elementSheetId =
        typeof element.schematic_sheet_id === "string"
          ? element.schematic_sheet_id
          : undefined
      return elementSheetId === sheetId || (index === 0 && !elementSheetId)
    })
    const inputFilename = `kicad-sheet-${index + 1}.circuit.json`
    const outputFilename = childFilenames[index] as string
    await writeFile(
      join(outputDir, inputFilename),
      `${JSON.stringify(childCircuitJson)}\n`,
    )
    await runCommand(
      [
        "bunx",
        "tsci",
        "export",
        inputFilename,
        "-f",
        "kicad_sch",
        "-o",
        outputFilename,
      ],
      outputDir,
    )
    zip.file(
      outputFilename,
      new Uint8Array(await readFile(join(outputDir, outputFilename))),
    )
    await Promise.all([
      rm(join(outputDir, inputFilename), { force: true }),
      rm(join(outputDir, outputFilename), { force: true }),
    ])
  }
  await writeFile(kicadZipPath, await zip.generateAsync({ type: "uint8array" }))
}

async function findFiles(root: string, filename: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const matches: string[] = []

  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(path, filename)))
    } else if (entry.isFile() && entry.name === filename) {
      matches.push(path)
    }
  }

  return matches
}

async function resolveSourceDirectory() {
  const sourceDirIndex = process.argv.indexOf("--source-dir")
  const explicitSource =
    sourceDirIndex >= 0 ? process.argv[sourceDirIndex + 1] : undefined

  if (explicitSource) return resolve(explicitSource)

  const cachedSource = join(projectRoot, "work", "boosters")
  if (await pathExists(join(cachedSource, ".git"))) {
    await runCommand(
      ["git", "pull", "--ff-only", "origin", "main"],
      cachedSource,
    )
  } else {
    await rm(cachedSource, { recursive: true, force: true })
    await mkdir(dirname(cachedSource), { recursive: true })
    await runCommand(
      [
        "git",
        "clone",
        "--depth",
        "1",
        `${SOURCE_REPOSITORY}.git`,
        cachedSource,
      ],
      projectRoot,
    )
  }

  return cachedSource
}

async function discoverBoards(sourceDir: string) {
  const entries = await readdir(sourceDir, { withFileTypes: true })
  const boardSlugs: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue

    const entrypoint = join(sourceDir, entry.name, "index.circuit.tsx")
    if (await pathExists(entrypoint)) boardSlugs.push(entry.name)
  }

  return boardSlugs.sort()
}

async function locateBoardOutput(sourceDir: string, slug: string) {
  const distDir = join(sourceDir, "dist")
  const glbFiles = await findFiles(distDir, "3d.glb")
  const glbPath = glbFiles.find((candidate) =>
    candidate.split(/[\\/]/).includes(slug),
  )

  if (!glbPath) throw new Error(`No GLB build output found for ${slug}`)

  const outputDir = dirname(glbPath)
  const required = ["pcb.svg", "schematic.svg"]
  for (const filename of required) {
    if (!(await pathExists(join(outputDir, filename)))) {
      throw new Error(`Missing ${filename} build output for ${slug}`)
    }
  }

  return outputDir
}

async function buildBoardRecord(
  sourceDir: string,
  slug: string,
  sourceCommit: string,
  publicBoardsDir: string,
): Promise<BoosterBoard> {
  const readme = await readFile(join(sourceDir, slug, "README.md"), "utf8")
  const { title, description } = extractReadmeMetadata(readme, slug)
  const outputDir = await locateBoardOutput(sourceDir, slug)
  const destination = join(publicBoardsDir, slug)
  await mkdir(destination, { recursive: true })

  await Promise.all([
    copyFile(join(outputDir, "3d.glb"), join(destination, "board.glb")),
    copyFile(join(outputDir, "pcb.svg"), join(destination, "pcb.svg")),
  ])

  const glb = await readFile(join(destination, "board.glb"))
  const circuitJson = JSON.parse(
    await readFile(join(outputDir, "circuit.json"), "utf8"),
  ) as Array<Record<string, unknown> & { type?: string }>
  const exportCircuitJsonFilename = "board.circuit.json"
  await copyFile(
    join(outputDir, "circuit.json"),
    join(outputDir, exportCircuitJsonFilename),
  )
  for (const [format, output] of [
    ["schematic-pdf", "schematic.pdf"],
    ["kicad_zip", "kicad.zip"],
  ] as const) {
    await runCommand(
      [
        "bunx",
        "tsci",
        "export",
        exportCircuitJsonFilename,
        "-f",
        format,
        "-o",
        output,
      ],
      outputDir,
    )
  }
  await rm(join(outputDir, exportCircuitJsonFilename), { force: true })
  await addHierarchicalSchematicsToKicadZip(
    circuitJson,
    outputDir,
    join(outputDir, "kicad.zip"),
  )
  const altiumZip = await convertCircuitJsonToAltiumZip(circuitJson, slug)
  await Promise.all([
    copyFile(
      join(outputDir, "schematic.pdf"),
      join(destination, "schematic.pdf"),
    ),
    copyFile(join(outputDir, "kicad.zip"), join(destination, "kicad.zip")),
    writeFile(join(destination, "altium.zip"), altiumZip),
  ])
  const pcbBoard = circuitJson.find((element) => element.type === "pcb_board")
  const boardSpan = Math.max(
    typeof pcbBoard?.width === "number" ? pcbBoard.width : 100,
    typeof pcbBoard?.height === "number" ? pcbBoard.height : 100,
  )
  const boardCameraScale = Math.hypot(
    typeof pcbBoard?.width === "number" ? pcbBoard.width : 100,
    typeof pcbBoard?.height === "number" ? pcbBoard.height : 100,
  )
  const boardCenter =
    pcbBoard?.center && typeof pcbBoard.center === "object"
      ? (pcbBoard.center as { x?: unknown; y?: unknown })
      : undefined
  const centerX = typeof boardCenter?.x === "number" ? boardCenter.x : 0
  const centerZ = typeof boardCenter?.y === "number" ? boardCenter.y : 0
  const { gltf, resources } = await loadGLTFWithResourcesFromURL(
    "https://local.invalid/board.glb",
    {
      fetchImpl: async () => new Response(new Uint8Array(glb)),
    },
  )
  const scene = createSceneFromGLTF(gltf, resources)
  const initialDrawCallCount = scene.drawCalls.length
  scene.drawCalls = scene.drawCalls.filter((drawCall) => {
    const bounds = computeWorldAABB([drawCall])
    const spans = bounds.max.map(
      (maximum, axis) => maximum - (bounds.min[axis] ?? maximum),
    )
    const center = bounds.max.map(
      (maximum, axis) => (maximum + (bounds.min[axis] ?? maximum)) / 2,
    )
    const isOversized = Math.max(...spans) > boardSpan * 2
    const isDistant = Math.max(...center.map(Math.abs)) > boardSpan * 2
    return !isOversized && !isDistant
  })

  const removedDrawCalls = initialDrawCallCount - scene.drawCalls.length
  if (removedDrawCalls > 0) {
    console.log(`Removed ${removedDrawCalls} thumbnail geometry outliers.`)
  }

  const { bitmap } = renderSceneFromGLTF(scene, {
    width: 960,
    height: 680,
    ambient: 0.35,
    supersampling: 2,
    fov: 50,
    camPos: [
      centerX + boardCameraScale * 0.64,
      boardCameraScale * 0.52,
      centerZ + boardCameraScale * 0.64,
    ],
    lookAt: [centerX, 0, centerZ],
  })
  const thumbnail = await encodePNG(bitmap)
  await writeFile(join(destination, "thumbnail.png"), thumbnail)

  return {
    slug,
    name: title,
    description,
    tags: inferTags(slug, title, description),
    githubUrl: `${SOURCE_REPOSITORY}/tree/main/${slug}`,
    sourceCommit,
    assets: {
      glb: `/boards/${slug}/board.glb`,
      thumbnail: `/boards/${slug}/thumbnail.png`,
      pcbSvg: `/boards/${slug}/pcb.svg`,
      kicadZip: `/boards/${slug}/kicad.zip`,
      altiumZip: `/boards/${slug}/altium.zip`,
      schematicPdf: `/boards/${slug}/schematic.pdf`,
    },
  }
}

export async function generateBoardAssets() {
  const sourceDir = await resolveSourceDirectory()
  const boardSlugs = await discoverBoards(sourceDir)

  if (boardSlugs.length === 0) {
    throw new Error(`No index.circuit.tsx boards found in ${sourceDir}`)
  }

  if (!process.argv.includes("--skip-build")) {
    await runCommand(["bun", "install", "--frozen-lockfile"], sourceDir)
    await runCommand(
      [
        "bunx",
        "tsci",
        "build",
        "--concurrency",
        "4",
        "--autorouter-timeout",
        "600s",
        "--all-images",
        "--svgs",
        "--glbs",
      ],
      sourceDir,
    )
  }

  const commitProcess = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd: sourceDir,
    stdout: "pipe",
  })
  const sourceCommit = (await new Response(commitProcess.stdout).text()).trim()
  if ((await commitProcess.exited) !== 0 || !sourceCommit) {
    throw new Error("Unable to resolve boosters source commit")
  }

  const publicBoardsDir = join(projectRoot, "public", "boards")
  await rm(publicBoardsDir, { recursive: true, force: true })
  await mkdir(publicBoardsDir, { recursive: true })

  const boards: BoosterBoard[] = []
  for (const slug of boardSlugs) {
    console.log(`\nPreparing ${slug}`)
    boards.push(
      await buildBoardRecord(sourceDir, slug, sourceCommit, publicBoardsDir),
    )
  }

  const manifest: BoardManifest = {
    sourceRepository: SOURCE_REPOSITORY,
    sourceCommit,
    boards,
  }
  await writeFile(
    join(publicBoardsDir, "index.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  console.log(`\nGenerated ${boards.length} BoosterPack board records.`)
}

if (import.meta.main) {
  generateBoardAssets().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
