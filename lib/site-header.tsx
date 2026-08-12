type SiteHeaderProps = {
  compact?: boolean
}

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <header
      className={compact ? "site-header site-header--compact" : "site-header"}
    >
      <a className="brand" href="/" aria-label="BoosterPack Index home">
        <img className="brand-mark" src="/ts-logo.svg" alt="" />
        <span className="brand-name">boosterpacks</span>
        <span className="brand-domain">.tscircuit.com</span>
      </a>
      <a
        className="source-link"
        href="https://github.com/tscircuit/boosters"
        target="_blank"
        rel="noreferrer"
      >
        GitHub <span aria-hidden="true">↗</span>
      </a>
    </header>
  )
}
