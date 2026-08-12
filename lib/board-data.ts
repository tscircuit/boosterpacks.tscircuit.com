import type { BoardManifest } from "lib/board-types"

export async function loadBoardManifest(): Promise<BoardManifest> {
  const response = await fetch("/boards/index.json")

  if (!response.ok) {
    throw new Error(`Unable to load board index (${response.status})`)
  }

  return response.json() as Promise<BoardManifest>
}
