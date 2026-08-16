import type { PerformanceMetric, PerformanceReport } from '../../electron/shared'

const MAX_LOCAL_METRICS = 500

let nextMetricId = 0
const metrics: PerformanceMetric[] = []

type MetricDetails = Record<string, number>

function safeDetails(details: MetricDetails): MetricDetails {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => Number.isFinite(value)))
}

function appendMetric(metric: PerformanceMetric): void {
  metrics.push(metric)
  if (metrics.length > MAX_LOCAL_METRICS) metrics.splice(0, metrics.length - MAX_LOCAL_METRICS)
}

/** Starts a local User Timing measurement. Document text and paths are never recorded. */
export function beginRendererMeasure(name: string, initialDetails: MetricDetails = {}): (details?: MetricDetails) => void {
  const id = `moji:${name}:${nextMetricId++}`
  const startMark = `${id}:start`
  const endMark = `${id}:end`
  performance.mark(startMark)

  return (details = {}): void => {
    performance.mark(endMark)
    performance.measure(name, startMark, endMark)
    const durationMs = performance.getEntriesByName(name, 'measure').at(-1)?.duration ?? 0
    appendMetric({ name, durationMs, timestamp: Date.now(), details: safeDetails({ ...initialDetails, ...details }) })
    performance.clearMarks(startMark)
    performance.clearMarks(endMark)
    performance.clearMeasures(name)
  }
}

/** Records an instantaneous local observation, such as memory or DOM shape. */
export function recordRendererObservation(name: string, details: MetricDetails): void {
  appendMetric({ name, durationMs: 0, timestamp: Date.now(), details: safeDetails(details) })
}

/** Imports duration measured in a worker or another execution context. */
export function recordRendererMeasure(name: string, durationMs: number, details: MetricDetails = {}): void {
  appendMetric({ name, durationMs, timestamp: Date.now(), details: safeDetails(details) })
}

/** Measures from a CodeMirror transaction until Chromium reaches next animation frame. */
export function measureRendererNextFrame(name: string, details: MetricDetails = {}): void {
  const end = beginRendererMeasure(name, details)
  requestAnimationFrame(() => end())
}

/** Chromium heap counters are renderer-local and unavailable on some platforms. */
export function captureRendererMemory(name = 'renderer:memory'): void {
  const chromiumPerformance = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
  }
  const memory = chromiumPerformance.memory
  if (!memory) return
  recordRendererObservation(name, {
    usedJsHeapBytes: memory.usedJSHeapSize,
    totalJsHeapBytes: memory.totalJSHeapSize,
    jsHeapLimitBytes: memory.jsHeapSizeLimit
  })
}

export function getRendererPerformanceReport(): PerformanceReport {
  return { metrics: [...metrics] }
}
