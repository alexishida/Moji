// @ts-check

const { mkdir, rm, stat, writeFile } = require('node:fs/promises')
const { createWriteStream } = require('node:fs')
const { join, relative, resolve } = require('node:path')
const { once } = require('node:events')

const MEBIBYTE = 1024 * 1024
const DEFAULT_OUTPUT = resolve(process.cwd(), '.tmp', 'benchmark-corpus')
const TAB_COUNT = 24
const TAB_SIZE = 256 * 1024
const LAYOUT_FIXTURE_SIZE = 64 * 1024
const FORMULA_LAYOUT_FIXTURE_SIZE = 16 * 1024

const RICH_PREFIX = `# Markdown performance corpus

This deterministic document exercises headings, tables, source code, TeX, Mermaid, and a local image.

![Benchmark image](assets/benchmark-image.svg)

## Data table

| Column | Value | Notes |
| --- | ---: | --- |
| alpha | 42 | stable fixture |
| beta | 84 | repeatable input |

## Formula

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

## Diagram

\`\`\`mermaid
flowchart LR
  source[Markdown] --> parser[Parser]
  parser --> preview[Preview]
\`\`\`

## Code

\`\`\`typescript
export function sample(value: number): number {
  return value * 2
}
\`\`\`

`

const PLAIN_LINE = 'Plain benchmark prose: stable words for renderer and editor measurements.\n'
const RICH_LINE = 'Rich benchmark prose keeps paragraph layout deterministic while preserving feature fixtures above.\n'
const SHORT_LINE = 'short line for layout, scroll, and editor transaction pressure\n'
const LONG_LINE_CHUNK = 'long-token-abcdefghijklmnopqrstuvwxyz-0123456789-'
const TABLE_LAYOUT_BLOCK = `## Table fixture

| Column | Value | Notes |
| --- | ---: | --- |
| alpha | 42 | stable table layout |
| beta | 84 | repeated table fixture |

`
const IMAGE_LAYOUT_BLOCK = `## Image fixture

![Benchmark image](assets/benchmark-image.svg)

Image caption keeps block spacing deterministic.

`
const CODE_LAYOUT_BLOCK = `## Code fixture

\`\`\`typescript
export function layoutFixture(value: number): number {
  return value * 2
}
\`\`\`

`
const FORMULA_LAYOUT_BLOCK = `## Formula fixture

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

`

function outputDirectory() {
  const option = process.argv.find((argument) => argument.startsWith('--output='))
  return option ? resolve(process.cwd(), option.slice('--output='.length)) : DEFAULT_OUTPUT
}

function write(stream, chunk) {
  if (stream.write(chunk)) return Promise.resolve()
  return once(stream, 'drain').then(() => undefined)
}

async function finish(stream) {
  stream.end()
  await once(stream, 'finish')
}

async function writeRepeated(path, targetBytes, prefix, line, lineLength = line.length) {
  const stream = createWriteStream(path, { encoding: 'utf8' })
  let written = 0
  if (prefix) {
    await write(stream, prefix)
    written += Buffer.byteLength(prefix)
  }

  while (written + lineLength <= targetBytes) {
    await write(stream, line)
    written += lineLength
  }

  if (written < targetBytes) await write(stream, line.slice(0, targetBytes - written))
  await finish(stream)
}

async function writeLongLines(path, targetBytes) {
  const stream = createWriteStream(path, { encoding: 'utf8' })
  const prefix = '# Long-line benchmark\n\n'
  const lineBytes = MEBIBYTE
  let written = Buffer.byteLength(prefix)
  await write(stream, prefix)

  while (written < targetBytes) {
    const remaining = targetBytes - written
    const bytesForLine = Math.min(lineBytes, remaining)
    const separator = written + bytesForLine < targetBytes ? '\n\n' : ''
    const contentBytes = bytesForLine - Buffer.byteLength(separator)
    const repeatedChunks = Math.floor(contentBytes / LONG_LINE_CHUNK.length)
    let line = LONG_LINE_CHUNK.repeat(repeatedChunks)
    line += 'x'.repeat(Math.max(0, contentBytes - Buffer.byteLength(line)))
    line += separator
    await write(stream, line)
    written += Buffer.byteLength(line)
  }
  await finish(stream)
}

async function fileEntry(output, path, kind) {
  const metadata = await stat(path)
  return { path: relative(output, path).replace(/\\/g, '/'), kind, bytes: metadata.size }
}

async function main() {
  const output = outputDirectory()
  const assets = join(output, 'assets')
  const tabs = join(output, 'many-tabs')
  await rm(output, { recursive: true, force: true })
  await Promise.all([mkdir(assets, { recursive: true }), mkdir(tabs, { recursive: true })])

  const imagePath = join(assets, 'benchmark-image.svg')
  await writeFile(imagePath, '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#282c34"/><text x="32" y="96" fill="#ffffff" font-size="36">Moji benchmark image</text></svg>')

  const corpus = [
    { path: join(output, 'plain-1mb.md'), kind: 'plain', write: () => writeRepeated(join(output, 'plain-1mb.md'), MEBIBYTE, '# Plain benchmark\n\n', PLAIN_LINE) },
    { path: join(output, 'rich-5mb.md'), kind: 'rich', write: () => writeRepeated(join(output, 'rich-5mb.md'), 5 * MEBIBYTE, RICH_PREFIX, RICH_LINE) },
    { path: join(output, 'short-lines-20mb.md'), kind: 'short-lines', write: () => writeRepeated(join(output, 'short-lines-20mb.md'), 20 * MEBIBYTE, '# Many short lines\n\n', SHORT_LINE) },
    { path: join(output, 'long-lines-50mb.md'), kind: 'long-lines', write: () => writeLongLines(join(output, 'long-lines-50mb.md'), 50 * MEBIBYTE) },
    { path: join(output, 'layout-tables.md'), kind: 'layout-tables', write: () => writeRepeated(join(output, 'layout-tables.md'), LAYOUT_FIXTURE_SIZE, '# Table layout benchmark\n\n', TABLE_LAYOUT_BLOCK) },
    { path: join(output, 'layout-images.md'), kind: 'layout-images', write: () => writeRepeated(join(output, 'layout-images.md'), LAYOUT_FIXTURE_SIZE, '# Image layout benchmark\n\n', IMAGE_LAYOUT_BLOCK) },
    { path: join(output, 'layout-code.md'), kind: 'layout-code', write: () => writeRepeated(join(output, 'layout-code.md'), LAYOUT_FIXTURE_SIZE, '# Code layout benchmark\n\n', CODE_LAYOUT_BLOCK) },
    { path: join(output, 'layout-formulas.md'), kind: 'layout-formulas', write: () => writeRepeated(join(output, 'layout-formulas.md'), FORMULA_LAYOUT_FIXTURE_SIZE, '# Formula layout benchmark\n\n', FORMULA_LAYOUT_BLOCK) }
  ]

  for (const entry of corpus) await entry.write()
  for (let index = 1; index <= TAB_COUNT; index += 1) {
    const path = join(tabs, `tab-${String(index).padStart(2, '0')}.md`)
    await writeRepeated(path, TAB_SIZE, `# Tab ${index}\n\n`, RICH_LINE)
    corpus.push({ path, kind: 'many-tabs', write: async () => undefined })
  }

  const files = await Promise.all(corpus.map(({ path, kind }) => fileEntry(output, path, kind)))
  files.push(await fileEntry(output, imagePath, 'image-asset'))
  const manifest = {
    generatedAt: 'deterministic',
    profiles: {
      normal: 'plain-1mb.md and layout-*.md',
      large: 'rich-5mb.md and short-lines-20mb.md',
      veryLarge: 'long-lines-50mb.md'
    },
    manyTabs: { directory: 'many-tabs', files: TAB_COUNT, bytesPerFile: TAB_SIZE },
    files
  }
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Benchmark corpus generated: ${output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
