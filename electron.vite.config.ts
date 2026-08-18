import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function keepKatexWoff2(css: string): string {
  return css.replace(
    /url\(fonts\/([\w-]+\.woff2)\) format\("woff2"\),\s*url\(fonts\/[\w-]+\.woff\) format\("woff"\),\s*url\(fonts\/[\w-]+\.ttf\) format\("truetype"\)/g,
    'url(fonts/$1) format("woff2")'
  )
}

/** Chromium supports WOFF2, so avoid emitting KaTeX's legacy font fallbacks. */
function katexWoff2Only(): Plugin {
  const katexCss = resolve(
    __dirname,
    'node_modules/katex/dist/katex.min.css'
  ).replace(/\\/g, '/')
  return {
    name: 'katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.split('?')[0].replace(/\\/g, '/')

      return normalizedId === katexCss
        ? { code: keepKatexWoff2(code), map: null }
        : null
    }
  }
}

/** Chromium uses WOFF2, including the locally packaged Inter display font. */
function interWoff2Only(): Plugin {
  const interCss = resolve(
    __dirname,
    'node_modules/@fontsource/inter/latin-400.css'
  ).replace(/\\/g, '/')

  return {
    name: 'inter-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.split('?')[0].replace(/\\/g, '/')
      if (normalizedId !== interCss) return null

      return {
        code: code.replace(
          /url\(([^)]+\.woff2)\) format\('woff2'\),\s*url\([^)]+\.woff\) format\('woff'\)/g,
          'url($1) format("woff2")'
        ),
        map: null
      }
    }
  }
}

/** markdown-it-texmath always receives our KaTeX engine, so its CommonJS fallback is dead code. */
function texmathWithoutFallbackKatex(): Plugin {
  return {
    name: 'texmath-without-fallback-katex',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.split('?')[0].replace(/\\/g, '/')
      if (!normalizedId.endsWith('/node_modules/markdown-it-texmath/texmath.js')) return null

      return {
        code: code.replace(
          /else if \(typeof module === "object"\)\s*texmath\.katex = require\('katex'\);\s*else/,
          'else'
        ),
        map: null
      }
    }
  }
}

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
      let css = keepKatexWoff2(readFileSync(resolve(katexDist, 'katex.min.css'), 'utf8'))
      css = css.replace(
        /url\(fonts\/([\w-]+\.woff2)\)/g,
        (_match, file: string) =>
          `url(data:font/woff2;base64,${readFileSync(resolve(katexDist, 'fonts', file)).toString('base64')})`
      )
      return `export default ${JSON.stringify(css)}`
    }
  }
}

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        // The PNG export runs its pixel loop on a worker thread, which needs its own
        // entry so `new Worker(...)` has a file to load next to `main.js`.
        input: {
          main: resolve(__dirname, 'electron/main.ts'),
          pngWorker: resolve(__dirname, 'electron/pngWorker.ts')
        },
        output: { entryFileNames: '[name].js' }
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
    worker: {
      format: 'es'
    },
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
    plugins: [react(), texmathWithoutFallbackKatex(), katexWoff2Only(), interWoff2Only(), katexEmbeddedFonts()]
  }
})
