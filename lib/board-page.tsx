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
              <div className="section-label">Design files</div>
              <h2>Board documentation</h2>
            </div>
            <p>Generated directly from this board’s tscircuit source.</p>
          </div>

          <div className="documentation-grid">
            <article className="pcb-panel">
              <div className="pcb-panel__canvas">
                <img
                  src={board.assets.pcbSvg}
                  alt={`${board.name} PCB layout`}
                />
              </div>
            </article>

            <aside className="download-panel">
              <div className="download-panel__icon" aria-hidden="true">
                ↓
              </div>
              <div className="file-type">Schematic</div>
              <h3>Download the full schematic</h3>
              <p>
                The schematic may contain multiple pages. Download the SVG to
                review the complete circuit drawing.
              </p>
              <div className="download-panel__meta">
                <span>SVG document</span>
                <span>Multi-page</span>
              </div>
              <a
                className="download-link"
                href={board.assets.schematicSvg}
                download={`${board.slug}-schematic.svg`}
              >
                Download schematic <span aria-hidden="true">↓</span>
              </a>
              <div className="download-panel__rule" />
              <span className="download-panel__note">
                Generated from tscircuit source
              </span>
            </aside>
          </div>
        </section>
      </main>

      <footer className="site-footer site-footer--detail">
        <a href="/">← Back to the directory</a>
        <a href={board.githubUrl} target="_blank" rel="noreferrer">
          View on GitHub ↗
        </a>
      </footer>
    </div>
  )
}
