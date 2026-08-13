export type CircuitElement = Record<string, unknown> & { type?: string }
export type Point = { x: number; y: number }
export type PointTransform = (circuitPoint: Point) => Point

export type PcbComponentId = string
export type PcbNetName = string
export type PcbPortId = string
export type PcbTraceId = string
export type SchematicComponentId = string
export type SchematicSheetId = string
export type SourceComponentId = string
export type SourceNetId = string
export type SourcePortId = string
export type SourceTraceId = string
