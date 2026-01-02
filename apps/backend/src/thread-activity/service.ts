export type ActiveThread = {
  profileId: string
  threadId: string
  turnId: string | null
  startedAt: number
}

export class ThreadActivityService {
  private readonly active = new Map<string, Map<string, ActiveThread>>()

  markStarted(profileId: string, threadId: string, turnId?: string | null, startedAt = Date.now()): void {
    if (!profileId || !threadId) {
      return
    }
    const byProfile = this.active.get(profileId) ?? new Map<string, ActiveThread>()
    const existing = byProfile.get(threadId)
    byProfile.set(threadId, {
      profileId,
      threadId,
      turnId: turnId ?? existing?.turnId ?? null,
      startedAt: existing?.startedAt ?? startedAt,
    })
    this.active.set(profileId, byProfile)
  }

  markCompleted(profileId: string, threadId: string): void {
    const byProfile = this.active.get(profileId)
    if (!byProfile) {
      return
    }
    byProfile.delete(threadId)
    if (!byProfile.size) {
      this.active.delete(profileId)
    }
  }

  list(profileId?: string): ActiveThread[] {
    if (profileId) {
      return [...(this.active.get(profileId)?.values() ?? [])]
    }
    return [...this.active.values()].flatMap((entries) => [...entries.values()])
  }

  clearProfile(profileId: string): void {
    this.active.delete(profileId)
  }
}
