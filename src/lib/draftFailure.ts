import type { DraftPersistProblem } from '../../electron/shared'

/**
 * Turns a refused draft write into something the user can act on.
 *
 * A draft is only refused when memory or disk runs out, and the main process reports both numbers,
 * so the notice says how much was needed and how much there was instead of showing an errno. The
 * text kept in the editor is never shortened to fit, which is why every message here points at
 * saving to a file as the way out.
 */
export interface DraftFailure {
  error?: string
  problem?: DraftPersistProblem
}

export interface DraftFailureNotice {
  key: string
  params: Record<string, string>
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = value >= 100 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${UNITS[unit]}`
}

export function draftFailureNotice(failure: DraftFailure): DraftFailureNotice {
  const problem = failure.problem
  if (!problem) return { key: 'notice.autoSaveFailed', params: { error: failure.error ?? '' } }
  return {
    key: problem.reason === 'memory-budget' ? 'notice.autoSaveOverMemoryBudget' : 'notice.autoSaveNoDiskSpace',
    params: { required: formatBytes(problem.requiredBytes), available: formatBytes(problem.availableBytes) }
  }
}
