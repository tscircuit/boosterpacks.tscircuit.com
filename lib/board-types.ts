export type BoardAssets = {
  glb: string
  thumbnail: string
  pcbSvg: string
  schematicSvg: string
}

export type BoosterBoard = {
  slug: string
  name: string
  description: string
  tags: string[]
  githubUrl: string
  sourceCommit: string
  assets: BoardAssets
}

export type BoardManifest = {
  sourceRepository: string
  sourceCommit: string
  boards: BoosterBoard[]
}
