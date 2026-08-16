export interface LiteralMatch {
  from: number
  to: number
}

export interface CaseInsensitiveMatcher {
  length: number
  findNext: (text: string, from: number) => number
}

function charactersEqualIgnoreCase(left: string, right: string): boolean {
  return left === right || left.toLowerCase() === right.toLowerCase()
}

/**
 * Builds a literal matcher without allocating a lower-cased copy of each
 * searched document. The small search term may be normalized once; document
 * characters are compared only while scanning candidate positions.
 */
export function createCaseInsensitiveMatcher(search: string): CaseInsensitiveMatcher | null {
  if (!search) return null
  const firstCharacter = search[0].toLowerCase()

  return {
    length: search.length,
    findNext: (text: string, from: number): number => {
      const lastStart = text.length - search.length
      for (let index = Math.max(0, from); index <= lastStart; index += 1) {
        if (text[index].toLowerCase() !== firstCharacter) continue

        let matched = true
        for (let offset = 1; offset < search.length; offset += 1) {
          if (!charactersEqualIgnoreCase(text[index + offset], search[offset])) {
            matched = false
            break
          }
        }
        if (matched) return index
      }
      return -1
    }
  }
}

/** Counts non-overlapping, case-insensitive literal matches without retaining their positions. */
export function countLiteralMatches(text: string, search: string): number {
  const matcher = createCaseInsensitiveMatcher(search)
  if (!matcher) return 0

  let count = 0
  for (let index = matcher.findNext(text, 0); index >= 0; index = matcher.findNext(text, index + matcher.length)) {
    count += 1
  }

  return count
}

/** Returns positions used by replacement operations. */
export function findLiteralMatches(text: string, search: string): LiteralMatch[] {
  const matcher = createCaseInsensitiveMatcher(search)
  if (!matcher) return []

  const matches: LiteralMatch[] = []

  for (let index = matcher.findNext(text, 0); index >= 0; index = matcher.findNext(text, index + matcher.length)) {
    matches.push({ from: index, to: index + matcher.length })
  }

  return matches
}
