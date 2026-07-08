/// <reference types="vite/client" />

declare module '*.css?inline' {
  const css: string
  export default css
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginWithOptions<{ enabled?: boolean; label?: boolean; labelAfter?: boolean }>
  export default plugin
}
