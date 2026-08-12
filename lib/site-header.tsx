type SiteHeaderProps = {
  compact?: boolean
}

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <header
      className={compact ? "site-header site-header--compact" : "site-header"}
    >
      <a className="brand" href="/" aria-label="BoosterPack Index home">
        <span className="brand-mark" aria-hidden="true">
          ts
        </span>
        <span className="brand-name">boosterpacks</span>
        <span className="brand-domain">.tscircuit.com</span>
      </a>
      <a
        className="source-link"
        href="https://github.com/tscircuit/boosters"
        target="_blank"
        rel="noreferrer"
      >
        Source boards <span aria-hidden="true">↗</span>
      </a>
    </header>
  )
}
