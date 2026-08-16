import { performance } from 'node:perf_hooks'
import type { PerformanceMetric, PerformanceReport } from './shared'

const MAX_LOCAL_METRICS = 500

let nextMetricId = 0
const metrics: PerformanceMetric[] = []

type MetricDetails = Record<string, number>

interface ProcessMemoryInfo {
  private: number
  shared: number
  residentSet: number
}

interface MemoryProcess {
  getProcessMemoryInfo?: () => Promise<ProcessMemoryInfo>
}

interface MemoryWebContents {
  getProcessMemoryInfo?: () => Promise<ProcessMemoryInfo>
}

function safeDetails(details: MetricDetails): MetricDetails {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => Number.isFinite(value)))
}

function appendMetric(metric: PerformanceMetric): void {
  metrics.push(metric)
  if (metrics.length > MAX_LOCAL_METRICS) metrics.splice(0, metrics.length - MAX_LOCAL_METRICS)
}

/** Main-process User Timing measurement. Values remain in this process only. */
export function beginMainMeasure(name: string, initialDetails: MetricDetails = {}): (details?: MetricDetails) => void {
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

export function recordMainObservation(name: string, details: MetricDetails): void {
  appendMetric({ name, durationMs: 0, timestamp: Date.now(), details: safeDetails(details) })
}

function memoryDetails(memory: ProcessMemoryInfo): MetricDetails {
  // Electron reports process memory in KiB; reports use bytes consistently.
  return {
    privateBytes: memory.private * 1024,
    sharedBytes: memory.shared * 1024,
    residentSetBytes: memory.residentSet * 1024
  }
}

export async function captureMainMemory(name = 'main:memory'): Promise<void> {
  const getProcessMemoryInfo = (process as MemoryProcess).getProcessMemoryInfo
  if (!getProcessMemoryInfo) return
  try {
    recordMainObservation(name, memoryDetails(await getProcessMemoryInfo.call(process)))
  } catch {
    // Sampling is optional; it must never fail an open or export operation.
  }
}

export async function captureWebContentsMemory(name: string, webContents: unknown): Promise<void> {
  const memoryWebContents = webContents as MemoryWebContents
  if (!memoryWebContents.getProcessMemoryInfo) return
  try {
    recordMainObservation(name, memoryDetails(await memoryWebContents.getProcessMemoryInfo()))
  } catch {
    // Export may destroy its hidden window before an optional memory sample resolves.
  }
}

export function getMainPerformanceReport(): PerformanceReport {
  return { metrics: [...metrics] }
}
