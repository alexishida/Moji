const NORMAL_DOCUMENT_LIMIT = 5 * 1024 * 1024
const LARGE_DOCUMENT_LIMIT = 20 * 1024 * 1024

export interface PreviewSchedule {
  debounceMs: number
  deferred: boolean
}

/**
 * Keeps normal documents responsive while preventing expensive preview work
 * from being scheduled faster than large documents can usually render.
 * `contentLength` deliberately uses string length: deriving UTF-8 byte length
 * on each edit would itself scan the entire document.
 */
export function getPreviewSchedule(contentLength: number): PreviewSchedule {
  if (contentLength <= NORMAL_DOCUMENT_LIMIT) return { debounceMs: 150, deferred: false }
  if (contentLength <= LARGE_DOCUMENT_LIMIT) return { debounceMs: 500, deferred: false }
  return { debounceMs: 1_200, deferred: true }
}

