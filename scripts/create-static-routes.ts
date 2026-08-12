import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { BoardManifest } from "lib/board-types"

const projectRoot = resolve(import.meta.dir, "..")
const distDir = join(projectRoot, "dist")
const manifest = JSON.parse(
  await readFile(join(projectRoot, "public", "boards", "index.json"), "utf8"),
) as BoardManifest

for (const board of manifest.boards) {
  const routeDir = join(distDir, "boards", board.slug)
  await mkdir(routeDir, { recursive: true })
  await copyFile(join(distDir, "index.html"), join(routeDir, "index.html"))
}

const workerSource = `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404) return response

    const url = new URL(request.url)
    if (url.pathname.startsWith("/boards/")) {
      url.pathname = "/index.html"
      return env.ASSETS.fetch(new Request(url, request))
    }

    return response
  },
}
`

await mkdir(join(distDir, "server"), { recursive: true })
await writeFile(join(distDir, "server", "index.js"), workerSource)

console.log(`Created ${manifest.boards.length} static board routes.`)
