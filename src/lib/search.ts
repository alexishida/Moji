export interface LiteralMatch {
  from: number
  to: number
}

/** Counts non-overlapping, case-insensitive literal matches without retaining their positions. */
export function countLiteralMatches(text: string, search: string): number {
  if (!search) return 0

  const needle = search.toLowerCase()
  const haystack = text.toLowerCase()
  let count = 0

  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + search.length)) {
    count += 1
  }

  return count
}

/** Returns positions used by replacement operations. */
export function findLiteralMatches(text: string, search: string): LiteralMatch[] {
  if (!search) return []

  const needle = search.toLowerCase()
  const haystack = text.toLowerCase()
  const matches: LiteralMatch[] = []

  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + search.length)) {
    matches.push({ from: index, to: index + search.length })
  }

  return matches
}
