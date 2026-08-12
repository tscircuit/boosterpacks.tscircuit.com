import { useEffect, useMemo, useRef, useState } from "react"
import { BoardCard } from "lib/board-card"
import type { BoosterBoard } from "lib/board-types"
import { SiteHeader } from "lib/site-header"

type HomePageProps = {
  boards: BoosterBoard[]
}

export function HomePage({ boards }: HomePageProps) {
  const [query, setQuery] = useState("")
  const searchInput = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredBoards = useMemo(() => {
    if (!normalizedQuery) return boards

    return boards.filter((board) =>
      [board.name, board.slug, board.description, ...board.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [boards, normalizedQuery])

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key !== "/" || target?.matches("input, textarea, select"))
        return

      event.preventDefault()
      searchInput.current?.focus()
    }

    document.addEventListener("keydown", focusSearch)
    return () => document.removeEventListener("keydown", focusSearch)
  }, [])

  return (
    <div className="home-page">
      <section className="hero-shell">
        <SiteHeader />
        <div className="hero">
          <div className="hero__eyebrow">
            <span className="status-dot" /> Open hardware directory
          </div>
          <h1>
            Find your next
            <br />
            <span className="hero__accent">BoosterPack.</span>
          </h1>
          <p className="hero__lede">
            Explore TI LaunchPad expansion boards recreated in tscircuit. Every
            board includes an interactive 3D model, PCB layout, and schematic.
          </p>
          <label className="search-box">
            <span className="search-box__icon" aria-hidden="true">
              ⌕
            </span>
            <span className="sr-only">Search BoosterPack boards</span>
            <input
              ref={searchInput}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by board, function, or component…"
            />
            <kbd>/</kbd>
          </label>
        </div>
      </section>

      <main className="directory">
        <div className="directory__heading">
          <div>
            <div className="section-label">The collection</div>
            <h2>Built to inspect</h2>
          </div>
          <p>
            {filteredBoards.length}{" "}
            {filteredBoards.length === 1 ? "board" : "boards"}
            {normalizedQuery
              ? ` matching “${query.trim()}”`
              : " ready to explore"}
          </p>
        </div>

        {filteredBoards.length > 0 ? (
          <div className="board-grid">
            {filteredBoards.map((board, index) => (
              <BoardCard board={board} index={index} key={board.slug} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-state__icon" aria-hidden="true">
              ⌕
            </span>
            <h2>No matching boards</h2>
            <p>Try a board name, “motor”, “sensor”, or “education”.</p>
            <button type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        )}
      </main>

      <footer className="site-footer">
        <span className="site-footer__note">
          Open-source board models from tscircuit/boosters.
        </span>
        <a href="https://tscircuit.com">Made with tscircuit ↗</a>
      </footer>
    </div>
  )
}
