import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type DocumentPayload,
  type ExportRequest,
  type Language,
  type MenuAction,
  type OpenManyResult,
  type OpenResult,
  type Settings,
  type WriteResult
} from './shared'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.setSettings, patch),
  setLanguage: (lang: Language): Promise<void> => ipcRenderer.invoke(IPC.setLanguage, lang),

  openDialog: (): Promise<OpenManyResult> => ipcRenderer.invoke(IPC.openDialog),
  readPath: (filePath: string): Promise<OpenResult> => ipcRenderer.invoke(IPC.readPath, filePath),
  readSample: (sampleName: string): Promise<OpenResult> => ipcRenderer.invoke(IPC.readSample, sampleName),
  save: (filePath: string, content: string): Promise<WriteResult> => ipcRenderer.invoke(IPC.save, filePath, content),
  saveAs: (content: string, suggestedName?: string): Promise<WriteResult> =>
    ipcRenderer.invoke(IPC.saveAs, content, suggestedName),
  exportAs: (request: ExportRequest): Promise<WriteResult> => ipcRenderer.invoke(IPC.export, request),
  confirmClose: (shouldClose: boolean): Promise<void> => ipcRenderer.invoke(IPC.confirmClose, shouldClose),

  /** Resolve the absolute path of a File obtained from a drag-and-drop event. */
  getDroppedPath: (file: File): string => webUtils.getPathForFile(file),

  onOpenDocument: (cb: (doc: DocumentPayload) => void): (() => void) => {
    const listener = (_e: unknown, doc: DocumentPayload): void => cb(doc)
    ipcRenderer.on(IPC.openDocument, listener)
    return () => ipcRenderer.removeListener(IPC.openDocument, listener)
  },
  onMenuAction: (cb: (action: MenuAction) => void): (() => void) => {
    const listener = (_e: unknown, action: MenuAction): void => cb(action)
    ipcRenderer.on(IPC.menuAction, listener)
    return () => ipcRenderer.removeListener(IPC.menuAction, listener)
  },
  onLanguageChanged: (cb: (lang: Language) => void): (() => void) => {
    const listener = (_e: unknown, lang: Language): void => cb(lang)
    ipcRenderer.on(IPC.setLanguage, listener)
    return () => ipcRenderer.removeListener(IPC.setLanguage, listener)
  }
}

export type RendererApi = typeof api

contextBridge.exposeInMainWorld('api', api)
