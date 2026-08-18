// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '../../electron/shared'
import { useDocumentState, useUpdateState, type WorkspaceDocument } from './useAppState'
import { renderHook } from '../test/harness'

/**
 * Most hooks in this module are thin `useState` wrappers whose tests would only restate React. What
 * is worth covering is the behaviour that is theirs: resolving the active document, and wiring the
 * update subscription so it is torn down with the component.
 */

const document = (id: string): WorkspaceDocument => ({
  id,
  path: `/notes/${id}.md`,
  title: id,
  content: '',
  stats: { length: 0, lines: 0, tokens: 0, words: 0 },
  revision: 0,
  savedRevision: 0,
  draftId: null,
  draftSavedRevision: null,
  readOnly: false
})

describe('useDocumentState', () => {
  it('starts with no documents and nothing active', () => {
    const hook = renderHook(useDocumentState)

    expect(hook.current().documents).toEqual([])
    expect(hook.current().activeDoc).toBeNull()
    expect(hook.current().mode).toBe('view')
    hook.unmount()
  })

  it('resolves the active document from the active id', () => {
    const hook = renderHook(useDocumentState)

    hook.act(() => hook.current().setDocuments([document('a'), document('b')]))
    hook.act(() => hook.current().setActiveDocId('b'))

    expect(hook.current().activeDoc?.id).toBe('b')
    hook.unmount()
  })

  it('reports no active document when the id matches nothing', () => {
    const hook = renderHook(useDocumentState)

    hook.act(() => hook.current().setDocuments([document('a')]))
    hook.act(() => hook.current().setActiveDocId('gone'))

    expect(hook.current().activeDoc).toBeNull()
    hook.unmount()
  })

  it('follows the document object after its contents change', () => {
    const hook = renderHook(useDocumentState)
    hook.act(() => hook.current().setDocuments([document('a')]))
    hook.act(() => hook.current().setActiveDocId('a'))

    hook.act(() => hook.current().setDocuments([{ ...document('a'), content: '# edited', revision: 1 }]))

    expect(hook.current().activeDoc).toMatchObject({ id: 'a', content: '# edited', revision: 1 })
    hook.unmount()
  })

  it('drops the active document when it is closed', () => {
    const hook = renderHook(useDocumentState)
    hook.act(() => hook.current().setDocuments([document('a'), document('b')]))
    hook.act(() => hook.current().setActiveDocId('b'))

    hook.act(() => hook.current().setDocuments([document('a')]))

    expect(hook.current().activeDoc).toBeNull()
    hook.unmount()
  })
})

describe('useUpdateState', () => {
  const state = {
    listener: null as ((value: UpdateState) => void) | null,
    unsubscribe: vi.fn(),
    getUpdateState: vi.fn<() => Promise<UpdateState>>()
  }

  beforeEach(() => {
    state.listener = null
    state.unsubscribe.mockClear()
    state.getUpdateState.mockReset().mockResolvedValue({ status: 'idle', currentVersion: '1.0.5' })
    vi.stubGlobal('window', Object.assign(globalThis.window, {
      api: {
        onUpdateState: (cb: (value: UpdateState) => void) => {
          state.listener = cb
          return state.unsubscribe
        },
        getUpdateState: state.getUpdateState
      }
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts idle at the packaged version before main answers', () => {
    const hook = renderHook(useUpdateState)

    expect(hook.current().updateState.status).toBe('idle')
    expect(hook.current().updateState.currentVersion).toMatch(/^\d+\.\d+\.\d+$/)
    hook.unmount()
  })

  it('seeds itself from the state main already holds', async () => {
    state.getUpdateState.mockResolvedValue({ status: 'available', currentVersion: '1.0.5', version: '1.1.0' })
    const hook = renderHook(useUpdateState)

    await vi.waitFor(() => expect(hook.current().updateState.status).toBe('available'))

    expect(hook.current().updateState).toMatchObject({ version: '1.1.0' })
    hook.unmount()
  })

  it('follows later pushes from main', () => {
    const hook = renderHook(useUpdateState)

    hook.act(() => state.listener?.({ status: 'error', currentVersion: '1.0.5', error: 'offline' }))

    expect(hook.current().updateState).toMatchObject({ status: 'error', error: 'offline' })
    hook.unmount()
  })

  it('unsubscribes on unmount, so a push cannot reach a dead component', () => {
    const hook = renderHook(useUpdateState)

    hook.unmount()

    expect(state.unsubscribe).toHaveBeenCalledOnce()
  })

  it('remembers a dismissed version independently of the update state', () => {
    const hook = renderHook(useUpdateState)

    hook.act(() => hook.current().setDismissedUpdate('1.1.0'))

    expect(hook.current().dismissedUpdate).toBe('1.1.0')
    expect(hook.current().updateState.status).toBe('idle')
    hook.unmount()
  })
})
