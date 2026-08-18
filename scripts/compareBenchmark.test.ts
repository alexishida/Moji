import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { compare, summarize, overDurationTolerance } = require('./compare-benchmark.cjs')

/** A report shaped like the runner's output, with one duration and one memory sample. */
function report(scenario: string, durationMs: number, memoryBytes?: number) {
  return {
    scenarios: {
      [scenario]: {
        renderer: {
          metrics: [
            { name: 'markdown:render-html', durationMs: durationMs / 2 },
            { name: 'preview:mount', durationMs: durationMs / 2 },
            ...(memoryBytes ? [{ name: 'renderer:memory', details: { usedJsHeapBytes: memoryBytes } }] : [])
          ]
        }
      }
    }
  }
}

const GB = 1024 * 1024 * 1024

describe('summarize', () => {
  it('takes the median of repeated samples rather than the last one', () => {
    const summary = summarize({
      scenarios: {
        'plain-1mb/open-preview': {
          renderer: { metrics: [
            { name: 'preview:mount', durationMs: 10 },
            { name: 'preview:mount', durationMs: 100 },
            { name: 'preview:mount', durationMs: 20 }
          ] }
        }
      }
    })

    expect(summary['plain-1mb/open-preview'].durations['preview:mount']).toBe(20)
  })

  it('adds up the metrics the budget states as a sum', () => {
    const summary = summarize(report('plain-1mb/open-preview', 300))

    expect(summary['plain-1mb/open-preview'].durations['markdown:render-html+preview:mount']).toBe(300)
  })

  it('takes the largest memory figure available across processes', () => {
    const summary = summarize({
      scenarios: {
        s: { main: { metrics: [{ name: 'main:memory', details: { privateBytes: 10, residentSetBytes: 90 } }] } }
      }
    })

    expect(summary.s.peakMemoryBytes).toBe(90)
  })
})

describe('overDurationTolerance', () => {
  it('allows a small absolute wobble on short measurements', () => {
    // 5 ms baseline: 12 ms is more than 15% up, but inside the flat 10 ms allowance.
    expect(overDurationTolerance(5, 12)).toBe(false)
    expect(overDurationTolerance(5, 16)).toBe(true)
  })

  it('uses the percentage alone once the measurement is large', () => {
    expect(overDurationTolerance(1000, 1100)).toBe(false)
    expect(overDurationTolerance(1000, 1200)).toBe(true)
  })
})

describe('compare', () => {
  it('passes a run that matches its baseline', () => {
    const baseline = report('plain-1mb/open-preview', 300)

    expect(compare(baseline, baseline).regressions).toEqual([])
  })

  it('ignores a slowdown that stays under the absolute budget', () => {
    // Five times slower, but still far below the 1.5 s the budget allows.
    const result = compare(report('plain-1mb/open-preview', 100), report('plain-1mb/open-preview', 500))

    expect(result.regressions).toEqual([])
  })

  it('ignores exceeding the budget when the baseline already did', () => {
    // Both over 1.5 s, but the run is only 5% slower: an accepted cost, not a regression.
    const result = compare(report('plain-1mb/open-preview', 2000), report('plain-1mb/open-preview', 2100))

    expect(result.regressions).toEqual([])
  })

  it('fails when a run is both over budget and materially slower', () => {
    const result = compare(report('plain-1mb/open-preview', 1400), report('plain-1mb/open-preview', 3000))

    expect(result.regressions).toHaveLength(1)
    expect(result.regressions[0]).toContain('plain-1mb/open-preview')
    expect(result.regressions[0]).toContain('1500 ms budget')
  })

  it('fails on a memory regression past the budget', () => {
    const result = compare(
      report('short-lines-20mb/open-preview', 10, 1.1 * GB),
      report('short-lines-20mb/open-preview', 10, 1.4 * GB)
    )

    expect(result.regressions).toHaveLength(1)
    expect(result.regressions[0]).toContain('memory')
  })

  it('reports a missing measurement instead of treating it as a pass', () => {
    const result = compare(report('plain-1mb/open-preview', 300), { scenarios: {} })

    expect(result.regressions).toEqual([])
    expect(result.skipped.join(' ')).toContain('missing from the current run')
  })
})
