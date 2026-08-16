import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownWorkerRequest, MarkdownWorkerResponse } from './markdownWorkerProtocol'
import type { RawMarkdownRenderResult } from './markdownCore'

/**
 * The worker client is the path every preview and export render actually takes, so the parts worth
 * pinning down are the ones a real Worker makes hard to observe: which request wins when the user
 * keeps typing, and what happens to the caller when the worker dies.
 */

class FakeWorker {
  static instances: FakeWorker[] = []

  onmessage: ((event: MessageEvent<MarkdownWorkerResponse>) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  onmessageerror: (() => void) | null = null

  readonly posted: MarkdownWorkerRequest[] = []
  readonly terminate = vi.fn()

  constructor(public readonly url: URL, public readonly options: { type: string; name: string }) {
    FakeWorker.instances.push(this)
  }

  postMessage(request: MarkdownWorkerRequest): void {
    this.posted.push(request)
  }

  /** Answers the request at `index`, defaulting to the most recent one. */
  respond(result: Partial<RawMarkdownRenderResult> = {}, index = this.posted.length - 1): void {
    const response: MarkdownWorkerResponse = {
      type: 'render-markdown-result',
      requestId: this.posted[index].requestId,
      ok: true,
      result: { rawHtml: '<p>ok</p>', outline: [], headingLines: [], ...result } as RawMarkdownRenderResult
    }
    this.onmessage?.({ data: response } as MessageEvent<MarkdownWorkerResponse>)
  }

  fail(error: string, index = this.posted.length - 1): void {
    this.onmessage?.({
      data: { type: 'render-markdown-result', requestId: this.posted[index].requestId, ok: false, error }
    } as MessageEvent<MarkdownWorkerResponse>)
  }
}

const only = (): FakeWorker => {
  expect(FakeWorker.instances).toHaveLength(1)
  return FakeWorker.instances[0]
}

vi.stubGlobal('Worker', FakeWorker)

let client: typeof import('./markdownWorkerClient')

beforeEach(async () => {
  FakeWorker.instances = []
  vi.resetModules()
  client = await import('./markdownWorkerClient')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('requestMarkdownRender', () => {
  it('starts one module worker and reuses it across requests', async () => {
    const first = client.requestMarkdownRender('# one')
    only().respond({ rawHtml: '<h1>one</h1>' })
    await expect(first).resolves.toMatchObject({ rawHtml: '<h1>one</h1>' })

    const second = client.requestMarkdownRender('# two')
    only().respond({ rawHtml: '<h1>two</h1>' })
    await expect(second).resolves.toMatchObject({ rawHtml: '<h1>two</h1>' })

    expect(only().options).toMatchObject({ type: 'module' })
    expect(only().posted).toHaveLength(2)
  })

  it('forwards the source and options the caller passed', async () => {
    const pending = client.requestMarkdownRender('# title', { blockMode: true })
    only().respond()
    await pending

    expect(only().posted[0]).toMatchObject({
      type: 'render-markdown',
      source: '# title',
      options: { blockMode: true }
    })
  })

  it('rejects a superseded request so a stale preview can never be rendered', async () => {
    const stale = client.requestMarkdownRender('# stale')
    const current = client.requestMarkdownRender('# current')

    const staleOutcome = stale.catch((error: Error) => error)
    only().respond({ rawHtml: '<h1>current</h1>' })

    await expect(current).resolves.toMatchObject({ rawHtml: '<h1>current</h1>' })
    expect(await staleOutcome).toBeInstanceOf(client.MarkdownWorkerRequestCanceledError)
  })

  it('ignores a late answer to a request that was already superseded', async () => {
    const stale = client.requestMarkdownRender('# stale')
    const staleOutcome = stale.catch((error: Error) => error)
    const current = client.requestMarkdownRender('# current')

    // The worker answers the abandoned request first; the live one must stay pending.
    only().respond({ rawHtml: '<h1>stale</h1>' }, 0)
    let settled = false
    void current.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)

    only().respond({ rawHtml: '<h1>current</h1>' }, 1)
    await expect(current).resolves.toMatchObject({ rawHtml: '<h1>current</h1>' })
    expect(await staleOutcome).toBeInstanceOf(client.MarkdownWorkerRequestCanceledError)
  })

  it('rejects with the error the worker reported', async () => {
    const pending = client.requestMarkdownRender('# broken')
    only().fail('render exploded')

    await expect(pending).rejects.toThrow('render exploded')
  })

  it('rejects the caller and replaces the worker after a fatal worker error', async () => {
    const pending = client.requestMarkdownRender('# doomed')
    const crashed = only()
    crashed.onerror?.({ message: 'worker died' })

    await expect(pending).rejects.toThrow('worker died')
    expect(crashed.terminate).toHaveBeenCalledOnce()

    // A dead worker must not strand every later render.
    const recovered = client.requestMarkdownRender('# after')
    expect(FakeWorker.instances).toHaveLength(2)
    FakeWorker.instances[1].respond({ rawHtml: '<h1>after</h1>' })
    await expect(recovered).resolves.toMatchObject({ rawHtml: '<h1>after</h1>' })
  })

  it('rejects the caller when the worker returns an uncloneable response', async () => {
    const pending = client.requestMarkdownRender('# odd')
    only().onmessageerror?.()

    await expect(pending).rejects.toThrow('invalid response')
  })
})

describe('requestMarkdownRenderOnce', () => {
  it('uses its own worker and terminates it after answering', async () => {
    const pending = client.requestMarkdownRenderOnce('# export')
    only().respond({ rawHtml: '<h1>export</h1>' })

    await expect(pending).resolves.toMatchObject({ rawHtml: '<h1>export</h1>' })
    expect(only().terminate).toHaveBeenCalledOnce()
  })

  it('neither supersedes nor is superseded by a preview render', async () => {
    const preview = client.requestMarkdownRender('# preview')
    const previewWorker = FakeWorker.instances[0]

    const exported = client.requestMarkdownRenderOnce('# export')
    const exportWorker = FakeWorker.instances[1]
    expect(exportWorker).not.toBe(previewWorker)

    exportWorker.respond({ rawHtml: '<h1>export</h1>' })
    await expect(exported).resolves.toMatchObject({ rawHtml: '<h1>export</h1>' })

    // The preview request was never cancelled by the export.
    previewWorker.respond({ rawHtml: '<h1>preview</h1>' })
    await expect(preview).resolves.toMatchObject({ rawHtml: '<h1>preview</h1>' })
  })

  it('terminates its worker when the render fails', async () => {
    const pending = client.requestMarkdownRenderOnce('# broken')
    only().fail('export exploded')

    await expect(pending).rejects.toThrow('export exploded')
    expect(only().terminate).toHaveBeenCalledOnce()
  })

  it('terminates its worker when the worker itself dies', async () => {
    const pending = client.requestMarkdownRenderOnce('# doomed')
    only().onerror?.({ message: 'export worker died' })

    await expect(pending).rejects.toThrow('export worker died')
    expect(only().terminate).toHaveBeenCalledOnce()
  })
})
