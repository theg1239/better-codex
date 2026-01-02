import { ReviewStore, type ReviewSessionRow } from './store'

export type ReviewUpsertInput = ReviewSessionRow

export class ReviewService {
  constructor(private readonly store: ReviewStore) {}

  init(): void {
    this.store.init()
  }

  upsert(session: ReviewUpsertInput): void {
    this.store.upsert(session)
  }

  complete(id: string, review: string | null, completedAt = Date.now()): void {
    this.store.complete(id, review, completedAt)
  }

  list(params: { profileId?: string; limit?: number; offset?: number }): ReviewSessionRow[] {
    return this.store.list({
      profileId: params.profileId,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    })
  }
}
