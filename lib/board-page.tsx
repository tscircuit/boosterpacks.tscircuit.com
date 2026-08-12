import { useEffect } from "react"
import type { BoosterBoard } from "lib/board-types"
import { SiteHeader } from "lib/site-header"

type BoardPageProps = {
  board: BoosterBoard
}

export function BoardPage({ board }: BoardPageProps) {
  useEffect(() => {
    void import("@google/model-viewer")
  }, [])

  return (
    <div className="detail-page">
      <div className="detail-nav-shell">
        <SiteHeader compact />
      </div>

      <main>
        <section className="detail-hero">
          <div className="detail-hero__copy">
            <a className="back-link" href="/">
              <span aria-hidden="true">←</span> All BoosterPacks
            </a>
            <div className="detail-kicker">TI LaunchPad expansion board</div>
            <h1>{board.name}</h1>
            <p>{board.description}</p>
            <div className="tag-list tag-list--detail">
              {board.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <a
              className="primary-link"
              href={board.githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              View source on GitHub <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div className="model-stage">
            <div className="model-stage__topline">
              <span>Interactive assembly</span>
              <span className="model-stage__live">
                <i /> GLB
              </span>
            </div>
            <model-viewer
              src={board.assets.glb}
              alt={`Interactive 3D model of ${board.name}`}
              camera-controls="true"
              auto-rotate="true"
              auto-rotate-delay="1600"
              rotation-per-second="12deg"
              shadow-intensity="0.8"
              shadow-softness="0.8"
              exposure="1"
              environment-image="neutral"
              interaction-prompt="auto"
              touch-action="pan-y"
            />
            <div className="model-stage__hint">
              Drag to orbit · scroll to zoom
            </div>
          </div>
        </section>

        <section className="board-views">
          <div className="board-views__heading">
            <div>
              <div className="section-label">Design views</div>
              <h2>See every connection.</h2>
            </div>
            <p>Generated directly from the board’s tscircuit source.</p>
          </div>

          <div className="drawing-grid">
            <article className="drawing-panel">
              <div className="drawing-panel__header">
                <div>
                  <span className="drawing-panel__number">01</span>
                  <h3>PCB layout</h3>
                </div>
                <a href={board.assets.pcbSvg} target="_blank" rel="noreferrer">
                  Open SVG ↗
                </a>
              </div>
              <a
                className="drawing-panel__canvas"
                href={board.assets.pcbSvg}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={board.assets.pcbSvg}
                  alt={`${board.name} PCB layout`}
                />
              </a>
            </article>

            <article className="drawing-panel drawing-panel--schematic">
              <div className="drawing-panel__header">
                <div>
                  <span className="drawing-panel__number">02</span>
                  <h3>Schematic</h3>
                </div>
                <a
                  href={board.assets.schematicSvg}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open SVG ↗
                </a>
              </div>
              <a
                className="drawing-panel__canvas"
                href={board.assets.schematicSvg}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={board.assets.schematicSvg}
                  alt={`${board.name} schematic`}
                />
              </a>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-footer site-footer--detail">
        <a href="/">← Back to the directory</a>
        <span className="site-footer__note">
          Source commit {board.sourceCommit.slice(0, 7)}
        </span>
      </footer>
    </div>
  )
}
