import { describe, expect, it } from 'vitest'
import { beginRendererMeasure, getRendererPerformanceReport, recordRendererObservation } from './performanceMetrics'

describe('renderer performance metrics', () => {
  it('keeps only numeric local details and records User Timing duration', () => {
    const name = 'test:renderer-stage'
    const finish = beginRendererMeasure(name, { markdownChars: 42, invalid: Number.NaN })
    finish({ htmlChars: 84 })

    const metric = [...getRendererPerformanceReport().metrics].reverse().find((entry) => entry.name === name)
    expect(metric).toMatchObject({ name, details: { markdownChars: 42, htmlChars: 84 } })
    expect(metric?.details).not.toHaveProperty('invalid')
  })

  it('records local observations without document text or paths', () => {
    const name = 'test:renderer-memory'
    recordRendererObservation(name, { usedJsHeapBytes: 1024 })

    const metric = [...getRendererPerformanceReport().metrics].reverse().find((entry) => entry.name === name)
    expect(metric).toEqual(expect.objectContaining({ name, details: { usedJsHeapBytes: 1024 } }))
  })
})
