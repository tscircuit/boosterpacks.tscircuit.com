export function getBoardSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/boards\/([^/]+)\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}
