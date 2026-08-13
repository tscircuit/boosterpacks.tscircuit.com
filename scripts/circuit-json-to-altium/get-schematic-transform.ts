import { applyToPoint, compose, scale, translate } from "transformation-matrix"
import type { Matrix } from "transformation-matrix"
import { asPoint } from "./format"
import type { CircuitElement, Point, PointTransform } from "./types"

type SchematicTransform = {
  circuitToAltiumSchematicPoint: PointTransform
  height: number
  width: number
}

function getAltiumSchematicPoint(
  circuitPoint: Point,
  circuitToAltiumSchematicMatrix: Matrix,
): Point {
  const altiumPoint = applyToPoint(circuitToAltiumSchematicMatrix, circuitPoint)
  return { x: Math.round(altiumPoint.x), y: Math.round(altiumPoint.y) }
}

export function getSchematicTransform(
  schematicElements: CircuitElement[],
): SchematicTransform {
  const circuitPoints: Point[] = []
  for (const element of schematicElements) {
    const center = asPoint(element.center)
    if (center) circuitPoints.push(center)
    const anchor = asPoint(element.anchor_position)
    if (anchor) circuitPoints.push(anchor)
    if (element.type === "schematic_trace" && Array.isArray(element.edges)) {
      for (const edge of element.edges as CircuitElement[]) {
        const from = asPoint(edge.from)
        const to = asPoint(edge.to)
        if (from) circuitPoints.push(from)
        if (to) circuitPoints.push(to)
      }
    }
    if (
      element.type === "schematic_trace" &&
      Array.isArray(element.junctions)
    ) {
      for (const junction of element.junctions) {
        const circuitPoint = asPoint(junction)
        if (circuitPoint) circuitPoints.push(circuitPoint)
      }
    }
  }
  const minX =
    circuitPoints.length > 0
      ? Math.min(...circuitPoints.map((point) => point.x))
      : 0
  const maxY =
    circuitPoints.length > 0
      ? Math.max(...circuitPoints.map((point) => point.y))
      : 0
  const circuitToAltiumSchematicMatrix = compose(
    translate(100, 100),
    scale(20, -20),
    translate(-minX, -maxY),
  )
  const altiumPoints = circuitPoints.map((circuitPoint) =>
    getAltiumSchematicPoint(circuitPoint, circuitToAltiumSchematicMatrix),
  )

  return {
    circuitToAltiumSchematicPoint: (circuitPoint) =>
      getAltiumSchematicPoint(circuitPoint, circuitToAltiumSchematicMatrix),
    width: Math.max(400, ...altiumPoints.map((point) => point.x + 100)),
    height: Math.max(300, ...altiumPoints.map((point) => point.y + 100)),
  }
}
