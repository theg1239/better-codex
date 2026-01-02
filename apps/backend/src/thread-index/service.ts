import { ThreadIndexStore, type ThreadIndexRow, type ThreadSearchQuery } from './store'

export type ThreadListItem = {
  id: string
  preview?: string
  modelProvider?: string
  createdAt?: number
  path?: string
  cwd?: string
  cliVersion?: string
  source?: string
}

export class ThreadIndexService {
  constructor(private readonly store: ThreadIndexStore) {}

  init(): void {
    this.store.init()
  }

  recordThreadList(profileId: string, threads: ThreadListItem[], fetchedAt = Date.now()): void {
    threads.forEach((thread) => {
      this.store.upsertThread(this.toRow(profileId, thread, fetchedAt))
    })
  }

  recordThreadStart(profileId: string, thread?: ThreadListItem): void {
    if (!thread?.id) {
      return
    }
    this.store.upsertThread(this.toRow(profileId, thread, Date.now()))
  }

  recordThreadResume(profileId: string, thread?: ThreadListItem): void {
    if (!thread?.id) {
      return
    }
    this.store.upsertThread(this.toRow(profileId, thread, Date.now()))
  }

  recordThreadArchive(profileId: string, threadId: string): void {
    this.store.markArchived(profileId, threadId)
  }

  search(query: ThreadSearchQuery): ThreadIndexRow[] {
    return this.store.search(query)
  }

  private toRow(profileId: string, thread: ThreadListItem, fetchedAt: number): ThreadIndexRow {
    return {
      threadId: thread.id,
      profileId,
      preview: thread.preview ?? null,
      modelProvider: thread.modelProvider ?? null,
      createdAt: normalizeTimestamp(thread.createdAt),
      path: thread.path ?? null,
      cwd: thread.cwd ?? null,
      source: thread.source ?? null,
      cliVersion: thread.cliVersion ?? null,
      status: 'active',
      archivedAt: null,
      lastSeenAt: fetchedAt,
    }
  }
}

const normalizeTimestamp = (value?: number): number | null => {
  if (!value) {
    return null
  }
  if (value > 1000000000000) {
    return Math.floor(value / 1000)
  }
  return value
}
