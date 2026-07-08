import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Exposes `virtual:katex-fonts-css`: KaTeX's stylesheet with every woff2 font
 * inlined as a base64 data URI. The export path loads its HTML from a `data:`
 * URL, where KaTeX's relative `url(fonts/…)` references cannot resolve, so the
 * fonts must travel inside the CSS for exported HTML/PDF/PNG to render math
 * faithfully. The woff/ttf fallbacks are dropped (Chromium always picks woff2).
 */
function katexEmbeddedFonts(): Plugin {
  const virtualId = 'virtual:katex-fonts-css'
  const resolvedId = '\0' + virtualId
  const katexDist = resolve(__dirname, 'node_modules/katex/dist')
  return {
    name: 'katex-embedded-fonts',
    resolveId(id) {
      return id === virtualId ? resolvedId : null
    },
    load(id) {
      if (id !== resolvedId) return null
      let css = readFileSync(resolve(katexDist, 'katex.min.css'), 'utf8')
      css = css.replace(
        /url\(fonts\/([\w-]+\.woff2)\)/g,
        (_match, file: string) =>
          `url(data:font/woff2;base64,${readFileSync(resolve(katexDist, 'fonts', file)).toString('base64')})`
      )
      css = css.replace(/,\s*url\(fonts\/[\w-]+\.(?:woff|ttf)\)\s*format\("[^"]*"\)/g, '')
      return `export default ${JSON.stringify(css)}`
    }
  }
}

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'electron/main.ts')
      },
      rollupOptions: {
        output: { entryFileNames: 'main.js' }
      }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts')
      },
      rollupOptions: {
        output: { entryFileNames: 'preload.js' }
      }
    }
  },
  renderer: {
    root: 'src',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    plugins: [react(), katexEmbeddedFonts()]
  }
})
