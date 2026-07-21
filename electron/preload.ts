import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type DiagramPngRequest,
  type DocumentPayload,
  type ExportRequest,
  type ImageDataResult,
  type OpenFolderResult,
  type OpenLocalPathResult,
  type OpenManyResult,
  type OpenPathResult,
  type OpenResult,
  type Settings,
  type UpdateState,
  type WorkspaceFolder,
  type WorkspaceSearchRequest,
  type WorkspaceSearchResult,
  type WriteResult
} from './shared'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.setSettings, patch),

  openDialog: (): Promise<OpenManyResult> => ipcRenderer.invoke(IPC.openDialog),
  openFolderDialog: (): Promise<OpenFolderResult> => ipcRenderer.invoke(IPC.openFolderDialog),
  openPath: (path: string): Promise<OpenPathResult> => ipcRenderer.invoke(IPC.openPath, path),
  openLocalPath: (path: string): Promise<OpenLocalPathResult> => ipcRenderer.invoke(IPC.openLocalPath, path),
  readPath: (filePath: string): Promise<OpenResult> => ipcRenderer.invoke(IPC.readPath, filePath),
  readWorkspaceFile: (filePath: string): Promise<OpenResult> => ipcRenderer.invoke(IPC.readWorkspaceFile, filePath),
  searchWorkspace: (request: WorkspaceSearchRequest): Promise<WorkspaceSearchResult> =>
    ipcRenderer.invoke(IPC.searchWorkspace, request),
  readImageAsDataUrl: (filePath: string): Promise<ImageDataResult> => ipcRenderer.invoke(IPC.readImage, filePath),
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
  downloadUpdate: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.downloadUpdate),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke(IPC.installUpdate),

  /** Resolve the absolute path of a File obtained from a drag-and-drop event. */
  getDroppedPath: (file: File): string => webUtils.getPathForFile(file),

  onOpenDocument: (cb: (doc: DocumentPayload) => void): (() => void) => {
    const listener = (_e: unknown, doc: DocumentPayload): void => cb(doc)
    ipcRenderer.on(IPC.openDocument, listener)
    return () => ipcRenderer.removeListener(IPC.openDocument, listener)
  },
  onOpenWorkspace: (cb: (folder: WorkspaceFolder) => void): (() => void) => {
    const listener = (_e: unknown, folder: WorkspaceFolder): void => cb(folder)
    ipcRenderer.on(IPC.openWorkspace, listener)
    return () => ipcRenderer.removeListener(IPC.openWorkspace, listener)
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
