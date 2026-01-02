import { Database } from 'bun:sqlite'

export type ReviewSessionRow = {
  id: string
  threadId: string
  profileId: string
  label: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: number
  completedAt: number | null
  model: string | null
  cwd: string | null
  review: string | null
}

export class ReviewStore {
  private readonly db: Database

  constructor(private readonly dbPath: string) {
    this.db = new Database(dbPath)
  }

  init(): void {
    this.db.exec(`
      pragma journal_mode = wal;
      create table if not exists review_sessions (
        id text primary key,
        thread_id text not null,
        profile_id text not null,
        label text,
        status text not null,
        started_at integer not null,
        completed_at integer,
        model text,
        cwd text,
        review text
      );
      create index if not exists review_sessions_profile on review_sessions(profile_id);
      create index if not exists review_sessions_thread on review_sessions(thread_id);
      create index if not exists review_sessions_status on review_sessions(status);
      create index if not exists review_sessions_started_at on review_sessions(started_at);
    `)
  }

  upsert(session: ReviewSessionRow): void {
    this.db
      .prepare(
        `insert into review_sessions
          (id, thread_id, profile_id, label, status, started_at, completed_at, model, cwd, review)
         values
          ($id, $thread_id, $profile_id, $label, $status, $started_at, $completed_at, $model, $cwd, $review)
         on conflict(id) do update set
          thread_id = excluded.thread_id,
          profile_id = excluded.profile_id,
          label = coalesce(excluded.label, review_sessions.label),
          status = excluded.status,
          started_at = excluded.started_at,
          completed_at = coalesce(excluded.completed_at, review_sessions.completed_at),
          model = coalesce(excluded.model, review_sessions.model),
          cwd = coalesce(excluded.cwd, review_sessions.cwd),
          review = coalesce(excluded.review, review_sessions.review)
        `
      )
      .run({
        $id: session.id,
        $thread_id: session.threadId,
        $profile_id: session.profileId,
        $label: session.label,
        $status: session.status,
        $started_at: session.startedAt,
        $completed_at: session.completedAt,
        $model: session.model,
        $cwd: session.cwd,
        $review: session.review,
      })
  }

  complete(id: string, review: string | null, completedAt: number): void {
    this.db
      .prepare(
        `update review_sessions
         set status = 'completed', review = $review, completed_at = $completed_at
         where id = $id
        `
      )
      .run({
        $id: id,
        $review: review,
        $completed_at: completedAt,
      })
  }

  list(params: { profileId?: string; limit: number; offset: number }): ReviewSessionRow[] {
    const limit = Math.min(200, Math.max(1, params.limit))
    const offset = Math.max(0, params.offset)
    if (params.profileId) {
      return this.db
        .prepare(
          `select * from review_sessions
           where profile_id = $profile_id
           order by started_at desc
           limit $limit offset $offset
          `
        )
        .all({
          $profile_id: params.profileId,
          $limit: limit,
          $offset: offset,
        }) as ReviewSessionRow[]
    }

    return this.db
      .prepare(
        `select * from review_sessions
         order by started_at desc
         limit $limit offset $offset
        `
      )
      .all({
        $limit: limit,
        $offset: offset,
      }) as ReviewSessionRow[]
  }
}
