import { renderMarkdownDocumentRawAsync } from '../lib/markdownCore'
import type { MarkdownWorkerRequest, MarkdownWorkerResponse } from '../lib/markdownWorkerProtocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<MarkdownWorkerRequest>) => void) | null
  postMessage: (response: MarkdownWorkerResponse) => void
}

const workerScope = self as unknown as WorkerScope
let latestRequest: MarkdownWorkerRequest | null = null
let processing = false

workerScope.onmessage = ({ data }) => {
  if (data.type !== 'render-markdown' || !Number.isSafeInteger(data.requestId) || typeof data.source !== 'string') return
  latestRequest = data
  void processLatestRequest()
}

async function processLatestRequest(): Promise<void> {
  if (processing) return
  processing = true

  try {
    while (latestRequest) {
      const request = latestRequest
      latestRequest = null
      try {
        const result = await renderMarkdownDocumentRawAsync(request.source, request.options)
        workerScope.postMessage({
          type: 'render-markdown-result',
          requestId: request.requestId,
          ok: true,
          result
        })
      } catch (error) {
        workerScope.postMessage({
          type: 'render-markdown-result',
          requestId: request.requestId,
          ok: false,
          error: error instanceof Error ? error.message : 'Markdown worker failed'
        })
      }
    }
  } finally {
    processing = false
    if (latestRequest) void processLatestRequest()
  }
}
