import { useEffect, useState } from "react"
import { BoardPage } from "lib/board-page"
import { loadBoardManifest } from "lib/board-data"
import type { BoardManifest } from "lib/board-types"
import { HomePage } from "lib/home-page"
import { getBoardSlugFromPath } from "lib/route"

type LoadState =
  | { status: "loading" }
  | { status: "ready"; manifest: BoardManifest }
  | { status: "error"; message: string }

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" })

  useEffect(() => {
    loadBoardManifest()
      .then((manifest) => setState({ status: "ready", manifest }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown error"
        setState({ status: "error", message })
      })
  }, [])

  if (state.status === "loading") {
    return (
      <div className="loading-screen">
        <img className="brand-mark" src="/ts-logo.svg" alt="" />
        <p>Loading BoosterPacks…</p>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="error-screen">
        <div className="section-label">Directory unavailable</div>
        <h1>The board index could not be loaded.</h1>
        <p>{state.message}</p>
        <a href="/">Try again</a>
      </div>
    )
  }

  const slug = getBoardSlugFromPath(window.location.pathname)
  if (!slug) return <HomePage boards={state.manifest.boards} />

  const board = state.manifest.boards.find(
    (candidate) => candidate.slug === slug,
  )
  if (board) return <BoardPage board={board} />

  return (
    <div className="error-screen">
      <div className="section-label">404 · Board not found</div>
      <h1>That BoosterPack is not in the index.</h1>
      <a href="/">← Browse all boards</a>
    </div>
  )
}
