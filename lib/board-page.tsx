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

        <section className="board-views" aria-label="PCB preview and downloads">
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
              <div className="download-panel__heading">
                <h2>Downloads</h2>
                <span>Pre-generated</span>
              </div>
              <nav className="download-list" aria-label="Board downloads">
                <a
                  className="download-option"
                  href={board.assets.kicadZip}
                  download={`${board.slug}-kicad.zip`}
                >
                  <span className="download-option__format">KiCad</span>
                  <span className="download-option__name">Project ZIP</span>
                  <span className="download-option__action" aria-hidden="true">
                    ↓
                  </span>
                </a>
                <a
                  className="download-option"
                  href={board.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="download-option__format">tscircuit</span>
                  <span className="download-option__name">Project source</span>
                  <span className="download-option__action" aria-hidden="true">
                    ↗
                  </span>
                </a>
                <a
                  className="download-option"
                  href={board.assets.altiumZip}
                  download={`${board.slug}-altium.zip`}
                >
                  <span className="download-option__format">Altium</span>
                  <span className="download-option__name">Project ZIP</span>
                  <span className="download-option__action" aria-hidden="true">
                    ↓
                  </span>
                </a>
                <a
                  className="download-option"
                  href={board.assets.schematicPdf}
                  download={`${board.slug}-schematic.pdf`}
                >
                  <span className="download-option__format">Schematic</span>
                  <span className="download-option__name">PDF document</span>
                  <span className="download-option__action" aria-hidden="true">
                    ↓
                  </span>
                </a>
              </nav>
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
