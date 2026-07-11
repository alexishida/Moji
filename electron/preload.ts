import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type DocumentPayload,
  type ExportRequest,
  type ImageDataResult,
  type OpenManyResult,
  type OpenResult,
  type Settings,
  type UpdateState,
  type WriteResult
} from './shared'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.setSettings, patch),

  openDialog: (): Promise<OpenManyResult> => ipcRenderer.invoke(IPC.openDialog),
  readPath: (filePath: string): Promise<OpenResult> => ipcRenderer.invoke(IPC.readPath, filePath),
  readImageAsDataUrl: (filePath: string): Promise<ImageDataResult> => ipcRenderer.invoke(IPC.readImage, filePath),
  readSample: (sampleName: string): Promise<OpenResult> => ipcRenderer.invoke(IPC.readSample, sampleName),
  save: (filePath: string, content: string): Promise<WriteResult> => ipcRenderer.invoke(IPC.save, filePath, content),
  saveAs: (content: string, suggestedName?: string): Promise<WriteResult> =>
    ipcRenderer.invoke(IPC.saveAs, content, suggestedName),
  exportAs: (request: ExportRequest): Promise<WriteResult> => ipcRenderer.invoke(IPC.export, request),
  confirmClose: (shouldClose: boolean): Promise<void> => ipcRenderer.invoke(IPC.confirmClose, shouldClose),
  getUpdateState: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.getUpdateState),
  checkForUpdate: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.checkForUpdate),
  downloadUpdate: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.downloadUpdate),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke(IPC.installUpdate),

  /** Resolve the absolute path of a File obtained from a drag-and-drop event. */
  getDroppedPath: (file: File): string => webUtils.getPathForFile(file),

  onOpenDocument: (cb: (doc: DocumentPayload) => void): (() => void) => {
    const listener = (_e: unknown, doc: DocumentPayload): void => cb(doc)
    ipcRenderer.on(IPC.openDocument, listener)
    return () => ipcRenderer.removeListener(IPC.openDocument, listener)
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
