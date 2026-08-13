export class TraceConnectivity {
  private readonly parentByTraceIndex: number[]

  constructor(traceCount: number) {
    this.parentByTraceIndex = Array.from(
      { length: traceCount },
      (_, traceIndex) => traceIndex,
    )
  }

  getRoot(traceIndex: number): number {
    let rootTraceIndex = traceIndex
    while (this.parentByTraceIndex[rootTraceIndex] !== rootTraceIndex) {
      rootTraceIndex = this.parentByTraceIndex[rootTraceIndex] as number
    }
    while (this.parentByTraceIndex[traceIndex] !== traceIndex) {
      const nextTraceIndex = this.parentByTraceIndex[traceIndex] as number
      this.parentByTraceIndex[traceIndex] = rootTraceIndex
      traceIndex = nextTraceIndex
    }
    return rootTraceIndex
  }

  connect(leftTraceIndex: number, rightTraceIndex: number): void {
    const leftRootTraceIndex = this.getRoot(leftTraceIndex)
    const rightRootTraceIndex = this.getRoot(rightTraceIndex)
    if (leftRootTraceIndex === rightRootTraceIndex) return
    const rootTraceIndex = Math.min(leftRootTraceIndex, rightRootTraceIndex)
    this.parentByTraceIndex[leftRootTraceIndex] = rootTraceIndex
    this.parentByTraceIndex[rightRootTraceIndex] = rootTraceIndex
  }
}
