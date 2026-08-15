import { app } from 'electron'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutoSaveDraft } from './shared'

let cache: AutoSaveDraft[] | null = null
let mutationQueue = Promise.resolve()

function draftsFile(): string {
  return join(app.getPath('userData'), 'drafts.json')
}

function isDraft(value: unknown): value is AutoSaveDraft {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  return (
    typeof raw['id'] === 'string' &&
    /^draft-[a-zA-Z0-9-]+$/.test(raw['id']) &&
    typeof raw['title'] === 'string' &&
    raw['title'].length <= 512 &&
    typeof raw['content'] === 'string' &&
    raw['content'].length <= 10 * 1024 * 1024
  )
}

async function persist(drafts: AutoSaveDraft[]): Promise<void> {
  const file = draftsFile()
  const temporaryFile = `${file}.tmp`
  await writeFile(temporaryFile, JSON.stringify(drafts, null, 2), 'utf-8')
  await rename(temporaryFile, file)
}

export async function getDrafts(): Promise<AutoSaveDraft[]> {
  if (cache) return cache
  try {
    const raw = JSON.parse(await readFile(draftsFile(), 'utf-8')) as unknown
    cache = Array.isArray(raw) ? raw.filter(isDraft) : []
  } catch {
    cache = []
  }
  return cache
}

function enqueueMutation(operation: () => Promise<void>): Promise<void> {
  const queued = mutationQueue.then(operation, operation)
  mutationQueue = queued.catch(() => undefined)
  return queued
}

export function saveDraft(draft: AutoSaveDraft): Promise<void> {
  return enqueueMutation(async () => {
    const drafts = await getDrafts()
    const index = drafts.findIndex((item) => item.id === draft.id)
    const next = [...drafts]
    if (index >= 0) next[index] = draft
    else next.push(draft)
    await persist(next)
    cache = next
  })
}

export function removeDraft(id: string): Promise<void> {
  return enqueueMutation(async () => {
    const next = (await getDrafts()).filter((draft) => draft.id !== id)
    await persist(next)
    cache = next
  })
}
