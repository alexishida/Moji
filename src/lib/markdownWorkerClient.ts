import type { RawMarkdownRenderResult, RenderMarkdownOptions } from './markdownCore'
import type { MarkdownWorkerRequest, MarkdownWorkerResponse } from './markdownWorkerProtocol'

interface PendingRequest {
  requestId: number
  resolve: (result: RawMarkdownRenderResult) => void
  reject: (error: Error) => void
}

export class MarkdownWorkerRequestCanceledError extends Error {
  constructor() {
    super('Markdown worker request superseded')
    this.name = 'MarkdownWorkerRequestCanceledError'
  }
}

let worker: Worker | null = null
let nextRequestId = 0
let pendingRequest: PendingRequest | null = null
let inFlightRequestId: number | null = null
let queuedRequest: MarkdownWorkerRequest | null = null

function resetWorker(error: Error): void {
  worker?.terminate()
  worker = null
  pendingRequest?.reject(error)
  pendingRequest = null
  inFlightRequestId = null
  queuedRequest = null
}

function createMarkdownWorker(): Worker {
  return new Worker(new URL('../workers/markdown.worker.ts', import.meta.url), {
    type: 'module',
    name: 'moji-markdown-renderer'
  })
}

function getWorker(): Worker {
  if (worker) return worker
  worker = createMarkdownWorker()
  worker.onmessage = ({ data }: MessageEvent<MarkdownWorkerResponse>) => {
    if (data.type !== 'render-markdown-result' || data.requestId !== inFlightRequestId) return
    inFlightRequestId = null
    if (data.requestId === pendingRequest?.requestId) {
      const pending = pendingRequest
      pendingRequest = null
      if (data.ok) pending.resolve(data.result)
      else pending.reject(new Error(data.error))
    }
    postLatestRequest()
  }
  worker.onerror = (event) => resetWorker(new Error(event.message || 'Markdown worker failed'))
  worker.onmessageerror = () => resetWorker(new Error('Markdown worker returned an invalid response'))
  return worker
}

function postLatestRequest(): void {
  if (inFlightRequestId !== null || !queuedRequest) return
  const request = queuedRequest
  queuedRequest = null
  inFlightRequestId = request.requestId
  try {
    getWorker().postMessage(request)
  } catch (error) {
    resetWorker(error instanceof Error ? error : new Error('Markdown worker request failed'))
  }
}

/** One current request plus one latest request; superseded callers fail immediately. */
export function requestMarkdownRender(
  source: string,
  options: RenderMarkdownOptions = {}
): Promise<RawMarkdownRenderResult> {
  pendingRequest?.reject(new MarkdownWorkerRequestCanceledError())
  pendingRequest = null
  const requestId = ++nextRequestId

  return new Promise((resolve, reject) => {
    pendingRequest = { requestId, resolve, reject }
    const request: MarkdownWorkerRequest = {
      type: 'render-markdown',
      requestId,
      source,
      options
    }
    // Coalesce before postMessage: cloning obsolete documents can itself block the UI,
    // and a worker busy parsing synchronously cannot drain its incoming message queue.
    queuedRequest = request
    postLatestRequest()
  })
}

/** Isolated request for export; cannot supersede or be superseded by preview. */
export function requestMarkdownRenderOnce(
  source: string,
  options: RenderMarkdownOptions = {}
): Promise<RawMarkdownRenderResult> {
  const exportWorker = createMarkdownWorker()
  const requestId = ++nextRequestId
  const request: MarkdownWorkerRequest = { type: 'render-markdown', requestId, source, options }

  return new Promise((resolve, reject) => {
    exportWorker.onmessage = ({ data }: MessageEvent<MarkdownWorkerResponse>) => {
      if (data.type !== 'render-markdown-result' || data.requestId !== requestId) return
      exportWorker.terminate()
      if (data.ok) resolve(data.result)
      else reject(new Error(data.error))
    }
    exportWorker.onerror = (event) => {
      exportWorker.terminate()
      reject(new Error(event.message || 'Markdown export worker failed'))
    }
    exportWorker.onmessageerror = () => {
      exportWorker.terminate()
      reject(new Error('Markdown export worker returned an invalid response'))
    }
    exportWorker.postMessage(request)
  })
}
