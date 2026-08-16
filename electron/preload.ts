import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type AutoSaveDraft,
  type DiagramPngRequest,
  type DraftResult,
  type DocumentMetadata,
  type DocumentStreamMessage,
  type DraftAppendResult,
  type DraftEditPayload,
  type ExportRequest,
  type OpenDialogResult,
  type OpenManyDone,
  type OpenManyProgress,
  type OpenResult,
  type PerformanceReport,
  type Settings,
  type UpdateState,
  type WriteResult
} from './shared'
import { DocumentTextDecoder } from './documentDecoder'

/**
 * Pulls a document from main as UTF-8 chunks and decodes them as they arrive.
 *
 * The port is private to this one request, so chunks need no correlation id and a failed read
 * cannot leak into another open. Only the finished `OpenResult` crosses the context bridge.
 */
function readDocumentStream(filePath: string): Promise<OpenResult> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel()
    const decoder = new DocumentTextDecoder()
    let metadata: DocumentMetadata | null = null
    let settled = false

    const settle = (result: OpenResult): void => {
      if (settled) return
      settled = true
      port1.close()
      resolve(result)
    }

    port1.onmessage = (event: MessageEvent): void => {
      const message = event.data as DocumentStreamMessage
      switch (message.type) {
        case 'meta':
          metadata = { path: message.path, sizeBytes: message.sizeBytes, sizeProfile: message.sizeProfile }
          break
        case 'chunk':
          decoder.push(new Uint8Array(message.buffer, 0, message.byteLength))
          break
        case 'end':
          settle(
            metadata
              ? { ok: true, path: metadata.path, content: decoder.finish(), sizeBytes: metadata.sizeBytes, sizeProfile: metadata.sizeProfile }
              : { ok: false, error: 'open failed' }
          )
          break
        case 'error':
          settle({ ok: false, error: message.error })
          break
      }
    }
    // A chunk that fails to deserialize would otherwise leave the caller waiting for an `end`
    // that can no longer be trusted.
    port1.onmessageerror = (): void => settle({ ok: false, error: 'open failed' })
    port1.start()

    ipcRenderer.postMessage(IPC.readPathStream, filePath, [port2])
  })
}

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.setSettings, patch),
  getDrafts: (): Promise<AutoSaveDraft[]> => ipcRenderer.invoke(IPC.getDrafts),
  saveDraft: (draft: AutoSaveDraft): Promise<DraftResult> => ipcRenderer.invoke(IPC.saveDraft, draft),
  /** `batches` holds one entry per editor transaction, in order; they cannot be flattened. */
  appendDraftEdits: (id: string, batches: DraftEditPayload[][], expectedLength: number): Promise<DraftAppendResult> =>
    ipcRenderer.invoke(IPC.appendDraftEdits, id, batches, expectedLength),
  removeDraft: (id: string): Promise<DraftResult> => ipcRenderer.invoke(IPC.removeDraft, id),

  openDialog: (): Promise<OpenDialogResult> => ipcRenderer.invoke(IPC.openDialog),
  cancelOpenMany: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.cancelOpenMany, sessionId),
  readPath: (filePath: string): Promise<OpenResult> => readDocumentStream(filePath),
  openLocalPath: (fileUrl: string): Promise<WriteResult> => ipcRenderer.invoke(IPC.openLocalPath, fileUrl),
  readSample: (sampleName: string): Promise<OpenResult> => ipcRenderer.invoke(IPC.readSample, sampleName),
  save: (filePath: string, content: string): Promise<WriteResult> => ipcRenderer.invoke(IPC.save, filePath, content),
  saveAs: (content: string, suggestedName?: string): Promise<WriteResult> =>
    ipcRenderer.invoke(IPC.saveAs, content, suggestedName),
  exportAs: (request: ExportRequest): Promise<WriteResult> => ipcRenderer.invoke(IPC.export, request),
  exportDiagramPng: (request: DiagramPngRequest): Promise<WriteResult> =>
    ipcRenderer.invoke(IPC.exportDiagramPng, request),
  confirmClose: (shouldClose: boolean): Promise<void> => ipcRenderer.invoke(IPC.confirmClose, shouldClose),
  getUpdateState: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.getUpdateState),
  checkForUpdate: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.checkForUpdate),
  getPerformanceReport: (): Promise<PerformanceReport> => ipcRenderer.invoke(IPC.getPerformanceReport),

  /** Resolve the absolute path of a File obtained from a drag-and-drop event. */
  getDroppedPath: (file: File): string => webUtils.getPathForFile(file),

  onOpenDocument: (cb: (doc: DocumentMetadata) => void): (() => void) => {
    const listener = (_e: unknown, doc: DocumentMetadata): void => cb(doc)
    ipcRenderer.on(IPC.openDocument, listener)
    return () => ipcRenderer.removeListener(IPC.openDocument, listener)
  },
  onOpenManyProgress: (cb: (progress: OpenManyProgress) => void): (() => void) => {
    const listener = (_e: unknown, progress: OpenManyProgress): void => cb(progress)
    ipcRenderer.on(IPC.openManyProgress, listener)
    return () => ipcRenderer.removeListener(IPC.openManyProgress, listener)
  },
  onOpenManyDone: (cb: (done: OpenManyDone) => void): (() => void) => {
    const listener = (_e: unknown, done: OpenManyDone): void => cb(done)
    ipcRenderer.on(IPC.openManyDone, listener)
    return () => ipcRenderer.removeListener(IPC.openManyDone, listener)
  },
  onCloseRequest: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.requestClose, listener)
    return () => ipcRenderer.removeListener(IPC.requestClose, listener)
  },
  onUpdateState: (cb: (state: UpdateState) => void): (() => void) => {
    const listener = (_e: unknown, state: UpdateState): void => cb(state)
    ipcRenderer.on(IPC.updateState, listener)
    return () => ipcRenderer.removeListener(IPC.updateState, listener)
  }
}

export type RendererApi = typeof api

contextBridge.exposeInMainWorld('api', api)
