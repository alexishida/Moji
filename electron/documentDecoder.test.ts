import { describe, expect, it } from 'vitest'
import { DocumentTextDecoder } from './documentDecoder'

function decodeInChunks(bytes: Uint8Array, chunkSize: number): string {
  const decoder = new DocumentTextDecoder()
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    decoder.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)))
  }
  return decoder.finish()
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('DocumentTextDecoder', () => {
  it('keeps multi-byte characters split across a chunk boundary intact', () => {
    const text = 'héllo — 日本語 🎉 fim'
    const bytes = encode(text)
    // Every boundary must round-trip, including those landing mid-sequence.
    for (let chunkSize = 1; chunkSize <= bytes.byteLength; chunkSize += 1) {
      expect(decodeInChunks(bytes, chunkSize)).toBe(text)
    }
  })

  it('strips a leading BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encode('# Title')])
    expect(decodeInChunks(bytes, 64)).toBe('# Title')
  })

  it('strips a BOM whose bytes span chunk boundaries', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encode('# Title')])
    expect(decodeInChunks(bytes, 1)).toBe('# Title')
    expect(decodeInChunks(bytes, 2)).toBe('# Title')
  })

  it('preserves a BOM that is not at the start of the document', () => {
    const text = 'a﻿b'
    expect(decodeInChunks(encode(text), 1)).toBe(text)
  })

  it('reports the byte count it consumed', () => {
    const decoder = new DocumentTextDecoder()
    const bytes = encode('日本語')
    decoder.push(bytes)
    decoder.finish()
    expect(decoder.bytesDecoded).toBe(bytes.byteLength)
  })

  it('returns an empty string for an empty document', () => {
    expect(decodeInChunks(new Uint8Array(0), 8)).toBe('')
  })
})
