import {
  DEFAULT_BOARD_HEIGHT_MM,
  DEFAULT_BOARD_WIDTH_MM,
  asPoint,
  asPositiveNumber,
  getPolygonArea,
  pointsEqual,
} from "./format"
import type { CircuitElement, Point } from "./types"

export const getBoardOutline = (board: CircuitElement | undefined): Point[] => {
  const parsedOutline = Array.isArray(board?.outline)
    ? board.outline.map(asPoint)
    : []
  const explicitOutline = parsedOutline.filter((point): point is Point =>
    Boolean(point),
  )
  const hasOnlyValidOutlinePoints =
    explicitOutline.length === parsedOutline.length
  if (
    explicitOutline.length > 1 &&
    pointsEqual(explicitOutline[0] as Point, explicitOutline.at(-1) as Point)
  ) {
    explicitOutline.pop()
  }

  if (
    hasOnlyValidOutlinePoints &&
    explicitOutline.length >= 3 &&
    getPolygonArea(explicitOutline) > 1e-9
  ) {
    return explicitOutline
  }

  const center = asPoint(board?.center) ?? { x: 0, y: 0 }
  const width = asPositiveNumber(board?.width, DEFAULT_BOARD_WIDTH_MM)
  const height = asPositiveNumber(board?.height, DEFAULT_BOARD_HEIGHT_MM)
  return [
    { x: center.x - width / 2, y: center.y - height / 2 },
    { x: center.x + width / 2, y: center.y - height / 2 },
    { x: center.x + width / 2, y: center.y + height / 2 },
    { x: center.x - width / 2, y: center.y + height / 2 },
  ]
}
