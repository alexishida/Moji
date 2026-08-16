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

function resetWorker(error: Error): void {
  worker?.terminate()
  worker = null
  pendingRequest?.reject(error)
  pendingRequest = null
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
    if (data.type !== 'render-markdown-result' || data.requestId !== pendingRequest?.requestId) return
    const pending = pendingRequest
    pendingRequest = null
    if (data.ok) pending.resolve(data.result)
    else pending.reject(new Error(data.error))
  }
  worker.onerror = (event) => resetWorker(new Error(event.message || 'Markdown worker failed'))
  worker.onmessageerror = () => resetWorker(new Error('Markdown worker returned an invalid response'))
  return worker
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
    getWorker().postMessage(request)
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
