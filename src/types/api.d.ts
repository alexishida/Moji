import type { RendererApi } from '../../electron/preload'

declare global {
  interface Window {
    api: RendererApi
  }
}

export {}
