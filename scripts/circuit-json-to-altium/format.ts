import { sanitizeAltiumFieldText } from "altiumts"
import type { CircuitElement, Point } from "./types"

export const MILLIMETERS_TO_MILS = 39.3700787402
export const DEFAULT_BOARD_WIDTH_MM = 100
export const DEFAULT_BOARD_HEIGHT_MM = 80

export const asNumber = (input: unknown, fallback = 0): number =>
  typeof input === "number" && Number.isFinite(input) ? input : fallback

export const asPositiveNumber = (input: unknown, fallback: number): number => {
  const number = asNumber(input, fallback)
  return number > 0 ? number : fallback
}

export const asString = (input: unknown, fallback = ""): string =>
  typeof input === "string" ? input : fallback

export const asPoint = (input: unknown): Point | undefined => {
  if (!input || typeof input !== "object") return undefined
  const point = input as Record<string, unknown>
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

export const sanitizeField = (field: unknown): string => {
  const rawField =
    typeof field === "number" && Number.isFinite(field)
      ? String(field)
      : asString(field)
  return sanitizeAltiumFieldText(rawField).trim()
}

export const sanitizeFilename = (filename: string): string => {
  const sanitizedFilename = filename
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^[.-]+|[.-]+$/gu, "")
    .slice(0, 80)
  if (!sanitizedFilename) return "board"
  if (/^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])$/iu.test(sanitizedFilename)) {
    return `board-${sanitizedFilename}`
  }
  return sanitizedFilename
}

export const formatNumber = (number: number): string => {
  const rounded = Math.round(number * 10_000) / 10_000
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(4)
}

export const formatMil = (mils: number): string => `${formatNumber(mils)}mil`

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
