import type { RawMarkdownRenderResult, RenderMarkdownOptions } from './markdownCore'

export interface MarkdownWorkerRequest {
  type: 'render-markdown'
  requestId: number
  source: string
  options: RenderMarkdownOptions
}

export interface MarkdownWorkerSuccessResponse {
  type: 'render-markdown-result'
  requestId: number
  ok: true
  result: RawMarkdownRenderResult
}

export interface MarkdownWorkerErrorResponse {
  type: 'render-markdown-result'
  requestId: number
  ok: false
  error: string
}

export type MarkdownWorkerResponse = MarkdownWorkerSuccessResponse | MarkdownWorkerErrorResponse
