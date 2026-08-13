import type { CircuitElement, Point } from "./types"

export const MILLIMETERS_TO_MILS = 39.3700787402
export const DEFAULT_BOARD_WIDTH_MM = 100
export const DEFAULT_BOARD_HEIGHT_MM = 80

export const asNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

export const asPositiveNumber = (value: unknown, fallback: number) => {
  const number = asNumber(value, fallback)
  return number > 0 ? number : fallback
}

export const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback

export const asPoint = (value: unknown): Point | undefined => {
  if (!value || typeof value !== "object") return undefined
  const point = value as Record<string, unknown>
  if (
    typeof point.x !== "number" ||
    !Number.isFinite(point.x) ||
    typeof point.y !== "number" ||
    !Number.isFinite(point.y)
  ) {
    return undefined
  }
  return { x: point.x, y: point.y }
}

export const sanitizeField = (value: unknown) => {
  const rawValue =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : asString(value)
  return [...rawValue]
    .map((character) => {
      const characterCode = character.charCodeAt(0)
      return character === "|" || characterCode < 32 || characterCode === 127
        ? " "
        : character
    })
    .join("")
    .trim()
}

export const sanitizeFilename = (value: string) => {
  const sanitized = value
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^[.-]+|[.-]+$/gu, "")
    .slice(0, 80)
  if (!sanitized) return "board"
  if (/^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])$/iu.test(sanitized)) {
    return `board-${sanitized}`
  }
  return sanitized
}

export const formatNumber = (value: number) => {
  const rounded = Math.round(value * 10_000) / 10_000
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(4)
}

export const formatMil = (value: number) => `${formatNumber(value)}mil`

export const byType = (circuitJson: CircuitElement[], type: string) =>
  circuitJson.filter((element) => element.type === type)

export const pointsEqual = (left: Point, right: Point) =>
  Math.abs(left.x - right.x) < 1e-9 && Math.abs(left.y - right.y) < 1e-9

export const getPolygonArea = (points: Point[]) =>
  Math.abs(
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length] as Point
      return area + point.x * next.y - next.x * point.y
    }, 0) / 2,
  )
