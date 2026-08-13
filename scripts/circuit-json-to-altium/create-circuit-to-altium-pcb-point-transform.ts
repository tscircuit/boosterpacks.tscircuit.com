import { applyToPoint, compose, scale, translate } from "transformation-matrix"
import { MILLIMETERS_TO_MILS } from "./format"
import type { Point, PointTransform } from "./types"

export function createCircuitToAltiumPcbPointTransform(
  outline: Point[],
): PointTransform {
  const minX = Math.min(...outline.map((point) => point.x))
  const minY = Math.min(...outline.map((point) => point.y))
  const circuitToAltiumPcbMatrix = compose(
    translate(1_000, 1_000),
    scale(MILLIMETERS_TO_MILS),
    translate(-minX, -minY),
  )

  return (circuitPoint) => applyToPoint(circuitToAltiumPcbMatrix, circuitPoint)
}
