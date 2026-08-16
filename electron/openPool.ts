export interface MapWithConcurrencyOptions<Result> {
  /** Checked before starting each not-yet-started item; already-started items still finish. */
  signal?: AbortSignal
  /** Invoked as soon as each item settles, in completion order (not input order). */
  onResult?: (result: Result, index: number) => void
}

/** Maps work with a fixed upper bound on simultaneously active operations. */
export async function mapWithConcurrency<T, Result>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<Result>,
  options?: MapWithConcurrencyOptions<Result>
): Promise<Result[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive integer')
  }

  const results = new Array<Result>(items.length)
  let nextIndex = 0

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      if (options?.signal?.aborted) return
      const index = nextIndex
      nextIndex += 1
      const result = await mapper(items[index], index)
      results[index] = result
      options?.onResult?.(result, index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}
