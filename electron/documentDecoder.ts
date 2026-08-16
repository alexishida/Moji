/** Removes a BOM left by an editor that wrote UTF-8 with a signature. */
export function stripLeadingBom(content: string): string {
  return content.startsWith('\uFEFF') ? content.slice(1) : content
}

/**
 * Assembles UTF-8 bytes arriving in arbitrary chunks into document text.
 *
 * `TextDecoder` in streaming mode owns the two correctness problems chunking creates: a
 * multi-byte sequence split across a boundary is buffered until its remaining bytes arrive,
 * and a leading BOM is consumed by BOM sniffing even when its three bytes span chunks.
 * `ignoreBOM` stays at its default `false`, which means the BOM is removed from the output
 * rather than surfacing as U+FEFF.
 */
export class DocumentTextDecoder {
  private readonly decoder = new TextDecoder('utf-8')
  private readonly parts: string[] = []
  private byteLength = 0

  /** Decodes one chunk. The chunk's bytes may end mid-sequence. */
  push(chunk: Uint8Array): void {
    this.byteLength += chunk.byteLength
    const text = this.decoder.decode(chunk, { stream: true })
    if (text) this.parts.push(text)
  }

  /** Flushes buffered bytes and returns the whole document. Trailing truncated sequences become U+FFFD. */
  finish(): string {
    const tail = this.decoder.decode()
    if (tail) this.parts.push(tail)
    return this.parts.join('')
  }

  /** Total bytes pushed so far. Used for local metrics only. */
  get bytesDecoded(): number {
    return this.byteLength
  }
}
