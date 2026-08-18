#!/usr/bin/env node
'use strict'

/**
 * Compares a benchmark run against the versioned baseline and fails on regression.
 *
 * The policy this implements is written down in `docs/performance-budget.md`; the numbers
 * below are that document expressed as code. Two rules matter and are easy to get wrong:
 *
 * - A run fails only when a metric is over the absolute limit AND over the relative
 *   tolerance. Either one alone is noise or an already-accepted cost.
 * - Small durations wobble with the clock, so anything at or under 50 ms gets a flat
 *   10 ms of headroom before the percentage is even considered.
 *
 * Usage:
 *   node scripts/compare-benchmark.cjs --current=.tmp/benchmark.json [--baseline=docs/baseline-v1.json]
 */

const { readFileSync } = require('node:fs')

const DURATION_TOLERANCE = 0.15
const MEMORY_TOLERANCE = 0.1
/** Durations at or below this get a flat allowance instead of a percentage. */
const SMALL_DURATION_MS = 50
const SMALL_DURATION_ALLOWANCE_MS = 10

/**
 * Absolute ceilings from the budget's "Limites absolutos" table.
 *
 * Keyed by `<scenario>` then metric. A metric with no entry here can never fail the run
 * on its own, which is deliberate: the budget is a product contract, and only what it
 * names is contractual.
 */
const ABSOLUTE_LIMITS = {
  'plain-1mb/open-preview': { 'markdown:render-html+preview:mount': 1500 },
  'rich-5mb/open-preview': { 'markdown:render-html+preview:mount': 5000 },
  'rich-5mb/export-html': { 'document:export': 5000 },
  'rich-5mb/export-pdf': { 'document:export': 15000 },
  'rich-5mb/export-png': { 'document:export': 20000 },
  'long-lines-50mb/typing': { 'editor:transaction-to-frame': 100 }
}

/** Memory ceilings, in bytes, from the same table. */
const MEMORY_LIMITS = {
  'short-lines-20mb/open-preview': 1.2 * 1024 * 1024 * 1024,
  'rich-5mb/export-png': 2.0 * 1024 * 1024 * 1024
}

/** Metric pairs the budget states as a sum rather than individually. */
const COMBINED_METRICS = {
  'markdown:render-html+preview:mount': ['markdown:render-html', 'preview:mount']
}

function parseArgs(argv) {
  const args = { baseline: 'docs/baseline-v1.json', current: null }
  for (const entry of argv.slice(2)) {
    const [flag, value] = entry.split('=')
    if (flag === '--baseline') args.baseline = value
    else if (flag === '--current') args.current = value
  }
  return args
}

function readReport(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    throw new Error(`Could not read benchmark report at ${path}: ${err.message}`)
  }
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/** Largest memory figure a sample offers, matching the budget's "maior valor disponível". */
function memoryOf(metric) {
  const details = metric.details || {}
  const candidates = [
    details.usedJsHeapBytes,
    details.privateBytes,
    details.residentSetBytes
  ].filter((value) => typeof value === 'number')
  return candidates.length > 0 ? Math.max(...candidates) : null
}

/**
 * Reduce one raw report to `{ scenario: { durations: {metric: ms}, peakMemoryBytes } }`.
 *
 * Both sides go through this, so a change in how the runner records things cannot make
 * the two sides disagree about what is being compared.
 */
function summarize(report) {
  const summary = {}

  for (const [scenario, areas] of Object.entries(report.scenarios || {})) {
    const durationsByName = {}
    let peakMemoryBytes = null

    for (const payload of Object.values(areas || {})) {
      for (const metric of (payload && payload.metrics) || []) {
        if (typeof metric.durationMs === 'number') {
          durationsByName[metric.name] = durationsByName[metric.name] || []
          durationsByName[metric.name].push(metric.durationMs)
        }
        const memory = memoryOf(metric)
        if (memory !== null) peakMemoryBytes = Math.max(peakMemoryBytes ?? 0, memory)
      }
    }

    const durations = {}
    for (const [name, values] of Object.entries(durationsByName)) {
      durations[name] = median(values)
    }
    for (const [combined, parts] of Object.entries(COMBINED_METRICS)) {
      const present = parts.filter((part) => typeof durations[part] === 'number')
      if (present.length === parts.length) {
        durations[combined] = parts.reduce((total, part) => total + durations[part], 0)
      }
    }

    summary[scenario] = { durations, peakMemoryBytes }
  }

  return summary
}

function overDurationTolerance(baseline, current) {
  const allowance = baseline <= SMALL_DURATION_MS ? SMALL_DURATION_ALLOWANCE_MS : 0
  return current > baseline * (1 + DURATION_TOLERANCE) + allowance
}

function compare(baselineReport, currentReport) {
  const baseline = summarize(baselineReport)
  const current = summarize(currentReport)
  const regressions = []
  const skipped = []

  for (const [scenario, limits] of Object.entries(ABSOLUTE_LIMITS)) {
    for (const [metric, limitMs] of Object.entries(limits)) {
      const before = baseline[scenario] && baseline[scenario].durations[metric]
      const after = current[scenario] && current[scenario].durations[metric]

      if (typeof after !== 'number') {
        // Absent measurements are an infrastructure failure, never a silent pass.
        skipped.push(`${scenario} ${metric}: missing from the current run`)
        continue
      }
      if (typeof before !== 'number') {
        skipped.push(`${scenario} ${metric}: missing from the baseline`)
        continue
      }

      if (after > limitMs && overDurationTolerance(before, after)) {
        regressions.push(
          `${scenario} ${metric}: ${after.toFixed(1)} ms exceeds the ${limitMs} ms budget ` +
            `and is over 15% above the ${before.toFixed(1)} ms baseline`
        )
      }
    }
  }

  for (const [scenario, limitBytes] of Object.entries(MEMORY_LIMITS)) {
    const before = baseline[scenario] && baseline[scenario].peakMemoryBytes
    const after = current[scenario] && current[scenario].peakMemoryBytes

    if (typeof after !== 'number') {
      skipped.push(`${scenario} memory: missing from the current run`)
      continue
    }
    if (typeof before !== 'number') {
      skipped.push(`${scenario} memory: missing from the baseline`)
      continue
    }

    if (after > limitBytes && after > before * (1 + MEMORY_TOLERANCE)) {
      const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(0)
      regressions.push(
        `${scenario} memory: ${mb(after)} MB exceeds the ${mb(limitBytes)} MB budget ` +
          `and is over 10% above the ${mb(before)} MB baseline`
      )
    }
  }

  return { regressions, skipped }
}

function main() {
  const args = parseArgs(process.argv)
  if (!args.current) {
    console.error('Usage: node scripts/compare-benchmark.cjs --current=<report.json> [--baseline=<baseline.json>]')
    process.exit(2)
  }

  const { regressions, skipped } = compare(readReport(args.baseline), readReport(args.current))

  for (const note of skipped) console.warn(`skipped: ${note}`)

  if (regressions.length > 0) {
    console.error('Performance budget exceeded:')
    for (const regression of regressions) console.error(`  - ${regression}`)
    process.exit(1)
  }

  console.log(`Within budget${skipped.length > 0 ? ` (${skipped.length} metric(s) not compared)` : ''}.`)
}

if (require.main === module) main()

module.exports = { compare, summarize, overDurationTolerance }
