import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './openPool'

describe('mapWithConcurrency', () => {
  it('preserves result order while bounding active work', async () => {
    let active = 0
    let peak = 0
    const values = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, value === 1 ? 10 : 1))
      active -= 1
      return value * 2
    })

    expect(values).toEqual([2, 4, 6, 8, 10])
    expect(peak).toBe(2)
  })

  it('rejects invalid concurrency', async () => {
    await expect(mapWithConcurrency([], 0, async () => 1)).rejects.toThrow('concurrency must be a positive integer')
  })

  it('reports each result via onResult as it settles', async () => {
    const seen: number[] = []
    await mapWithConcurrency([1, 2, 3], 2, async (value) => value * 2, {
      onResult: (result) => seen.push(result)
    })

    expect(seen.sort((a, b) => a - b)).toEqual([2, 4, 6])
  })

  it('stops starting new work once the signal aborts', async () => {
    const controller = new AbortController()
    let started = 0

    const values = await mapWithConcurrency([1, 2, 3, 4, 5], 1, async (value) => {
      started += 1
      if (started === 2) controller.abort()
      await new Promise((resolve) => setTimeout(resolve, 1))
      return value
    }, { signal: controller.signal })

    expect(started).toBe(2)
    expect(values.slice(2)).toEqual([undefined, undefined, undefined])
  })
})
