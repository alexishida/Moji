#!/usr/bin/env node
/**
 * Compares the two ways a document can cross the main -> renderer boundary (PERF-403).
 *
 *   string : readFile(path, 'utf-8') -> JS string -> structured clone   (what invoke did)
 *   bytes  : chunked read -> structured clone per chunk -> TextDecoder  (what the port does)
 *
 * Electron serializes IPC payloads with V8's structured clone, so `v8.serialize` /
 * `v8.deserialize` model the copy that happens on the wire. This measures the serialization
 * and decode work, not Chromium's pipe; treat it as a transport comparison, not an
 * end-to-end open benchmark.
 *
 * Usage: node scripts/measure-ipc-transport.cjs [--sizes=1,5,20] [--chunk-mb=1] [--runs=3]
 */
const { mkdirSync, writeFileSync, existsSync, readFileSync, openSync, readSync, closeSync, statSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { serialize, deserialize } = require('node:v8')

const OUTPUT_DIRECTORY = resolve(__dirname, '..', '.tmp', 'ipc-transport')

function arg(name, fallback) {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`))
  return match ? match.slice(name.length + 3) : fallback
}

const SIZES_MB = arg('sizes', '1,5,20').split(',').map(Number)
const CHUNK_BYTES = Number(arg('chunk-mb', '1')) * 1024 * 1024
const RUNS = Number(arg('runs', '3'))

/** Markdown-ish content with the accented characters real documents carry. */
function buildCorpus(sizeMb) {
  const path = join(OUTPUT_DIRECTORY, `transport-${sizeMb}mb.md`)
  const targetBytes = sizeMb * 1024 * 1024
  if (existsSync(path) && statSync(path).size >= targetBytes) return path

  const paragraph = [
    '## Seção de medição',
    '',
    'Parágrafo com acentuação, travessões — e pontuação típica de documentação técnica.',
    'Uma linha adicional mantém a razão entre quebras de linha e texto próxima do real.',
    '',
    '- item de lista com `código inline`',
    '- outro item, com [link](https://example.com)',
    '',
    '```ts',
    'export function exemplo(valor: string): string {',
    '  return valor.trim()',
    '}',
    '```',
    ''
  ].join('\n')

  const parts = ['# Corpus de transporte\n\n']
  let bytes = Buffer.byteLength(parts[0])
  while (bytes < targetBytes) {
    parts.push(paragraph)
    bytes += Buffer.byteLength(paragraph)
  }
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
  writeFileSync(path, parts.join('\n'))
  return path
}

function measure(fn) {
  const startedAt = process.hrtime.bigint()
  const result = fn()
  return { ms: Number(process.hrtime.bigint() - startedAt) / 1e6, result }
}

/** Today's path: one full UTF-16 string in main, cloned whole. */
function stringTransport(path) {
  const read = measure(() => readFileSync(path, 'utf-8'))
  const clone = measure(() => serialize(read.result))
  const payloadBytes = clone.result.byteLength
  const receive = measure(() => deserialize(clone.result))

  return {
    totalMs: read.ms + clone.ms + receive.ms,
    readMs: read.ms,
    cloneMs: clone.ms,
    receiveMs: receive.ms,
    payloadBytes,
    // Main holds the file bytes and the decoded string, then the serialized copy on top.
    peakMainBytes: Buffer.byteLength(read.result) + read.result.length * 2 + payloadBytes,
    text: receive.result
  }
}

/** Streamed path: chunked bytes, decoded incrementally in the renderer. */
function byteTransport(path) {
  const decoder = new TextDecoder('utf-8')
  const handle = openSync(path, 'r')
  let readMs = 0
  let cloneMs = 0
  let receiveMs = 0
  let payloadBytes = 0
  let chunks = 0
  const parts = []

  try {
    for (;;) {
      const bytes = new Uint8Array(CHUNK_BYTES)
      const read = measure(() => readSync(handle, bytes, 0, CHUNK_BYTES, null))
      readMs += read.ms
      if (read.result === 0) break
      chunks += 1

      const chunk = bytes.subarray(0, read.result)
      const clone = measure(() => serialize(chunk))
      cloneMs += clone.ms
      payloadBytes += clone.result.byteLength

      const receive = measure(() => {
        const received = deserialize(clone.result)
        return decoder.decode(received, { stream: true })
      })
      receiveMs += receive.ms
      parts.push(receive.result)
    }
  } finally {
    closeSync(handle)
  }

  parts.push(decoder.decode())
  return {
    totalMs: readMs + cloneMs + receiveMs,
    readMs,
    cloneMs,
    receiveMs,
    payloadBytes,
    chunks,
    // Main only ever holds one chunk plus its serialized copy.
    peakMainBytes: CHUNK_BYTES * 2,
    text: parts.join('')
  }
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const ms = (value) => `${value.toFixed(0)} ms`

console.log(`chunk=${mb(CHUNK_BYTES)} runs=${RUNS} node=${process.version}\n`)
const header = ['size', 'transport', 'total', 'read', 'clone', 'receive', 'payload', 'peak main']
console.log(header.join('\t'))

for (const sizeMb of SIZES_MB) {
  const path = buildCorpus(sizeMb)
  const expected = readFileSync(path, 'utf-8')
  const samples = { string: [], bytes: [] }
  let last = {}

  for (let run = 0; run < RUNS; run += 1) {
    for (const [name, transport] of [['string', stringTransport], ['bytes', byteTransport]]) {
      const result = transport(path)
      if (result.text !== expected) throw new Error(`${name} transport corrupted the document at ${sizeMb} MB`)
      samples[name].push(result.totalMs)
      last[name] = result
    }
  }

  for (const name of ['string', 'bytes']) {
    const result = last[name]
    console.log([
      `${sizeMb} MB`,
      name,
      ms(median(samples[name])),
      ms(result.readMs),
      ms(result.cloneMs),
      ms(result.receiveMs),
      mb(result.payloadBytes),
      mb(result.peakMainBytes)
    ].join('\t'))
  }
}
