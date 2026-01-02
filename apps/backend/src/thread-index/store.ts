import { Database } from 'bun:sqlite'

export type ThreadIndexRow = {
  threadId: string
  profileId: string
  preview: string | null
  modelProvider: string | null
  createdAt: number | null
  path: string | null
  cwd: string | null
  source: string | null
  cliVersion: string | null
  status: 'active' | 'archived'
  archivedAt: number | null
  lastSeenAt: number | null
}

export type ThreadSearchQuery = {
  query?: string
  profileId?: string
  model?: string
  status?: 'active' | 'archived'
  createdAfter?: number
  createdBefore?: number
  limit?: number
  offset?: number
}

export class ThreadIndexStore {
  private readonly db: Database

  constructor(private readonly dbPath: string) {
    this.db = new Database(dbPath)
  }

  init(): void {
    this.db.exec(`
      pragma journal_mode = wal;
      create table if not exists thread_index (
        thread_id text primary key,
        profile_id text not null,
        preview text,
        model_provider text,
        created_at integer,
        path text,
        cwd text,
        source text,
        cli_version text,
        status text not null default 'active',
        archived_at integer,
        last_seen_at integer
      );
      create index if not exists thread_index_profile on thread_index(profile_id);
      create index if not exists thread_index_model on thread_index(model_provider);
      create index if not exists thread_index_created on thread_index(created_at);
      create index if not exists thread_index_status on thread_index(status);

      create virtual table if not exists thread_index_fts using fts5(
        thread_id,
        preview,
        path,
        cwd,
        model_provider,
        profile_id
      );
    `)
  }

  upsertThread(row: ThreadIndexRow): void {
    this.db
      .prepare(
        `insert into thread_index
          (thread_id, profile_id, preview, model_provider, created_at, path, cwd, source, cli_version, status, archived_at, last_seen_at)
         values
          ($thread_id, $profile_id, $preview, $model_provider, $created_at, $path, $cwd, $source, $cli_version, $status, $archived_at, $last_seen_at)
         on conflict(thread_id) do update set
          profile_id = excluded.profile_id,
          preview = excluded.preview,
          model_provider = excluded.model_provider,
          created_at = excluded.created_at,
          path = excluded.path,
          cwd = excluded.cwd,
          source = excluded.source,
          cli_version = excluded.cli_version,
          status = excluded.status,
          archived_at = excluded.archived_at,
          last_seen_at = excluded.last_seen_at
        `
      )
      .run({
        $thread_id: row.threadId,
        $profile_id: row.profileId,
        $preview: row.preview,
        $model_provider: row.modelProvider,
        $created_at: row.createdAt,
        $path: row.path,
        $cwd: row.cwd,
        $source: row.source,
        $cli_version: row.cliVersion,
        $status: row.status,
        $archived_at: row.archivedAt,
        $last_seen_at: row.lastSeenAt,
      })

    this.db
      .prepare('delete from thread_index_fts where thread_id = $thread_id')
      .run({ $thread_id: row.threadId })
    this.db
      .prepare(
        `insert into thread_index_fts (thread_id, preview, path, cwd, model_provider, profile_id)
         values ($thread_id, $preview, $path, $cwd, $model_provider, $profile_id)
        `
      )
      .run({
        $thread_id: row.threadId,
        $preview: row.preview ?? '',
        $path: row.path ?? '',
        $cwd: row.cwd ?? '',
        $model_provider: row.modelProvider ?? '',
        $profile_id: row.profileId,
      })
  }

  markArchived(profileId: string, threadId: string): void {
    const timestamp = Date.now()
    this.db
      .prepare(
        `update thread_index
         set status = 'archived', archived_at = $archived_at
         where thread_id = $thread_id and profile_id = $profile_id
        `
      )
      .run({
        $thread_id: threadId,
        $profile_id: profileId,
        $archived_at: timestamp,
      })
  }

  search(query: ThreadSearchQuery): ThreadIndexRow[] {
    const limit = Math.min(200, Math.max(1, query.limit ?? 50))
    const offset = Math.max(0, query.offset ?? 0)
    const filters: string[] = []
    // bun's Statement typing does not currently accept named params; values are string | number | null
    const params: Record<string, string | number | null> = {
      $limit: limit,
      $offset: offset,
      $profile_id: query.profileId ?? null,
      $model: query.model ?? null,
      $status: query.status ?? null,
      $created_after: query.createdAfter ?? null,
      $created_before: query.createdBefore ?? null,
    }

    if (query.profileId) {
      filters.push('t.profile_id = $profile_id')
    }
    if (query.model) {
      filters.push('t.model_provider = $model')
    }
    if (query.status) {
      filters.push('t.status = $status')
    }
    if (query.createdAfter) {
      filters.push('t.created_at >= $created_after')
    }
    if (query.createdBefore) {
      filters.push('t.created_at <= $created_before')
    }

    const filterSql = filters.length ? `and ${filters.join(' and ')}` : ''

    if (query.query && query.query.trim()) {
      params.$query = query.query
      const sql = `
        select t.* from thread_index t
        join thread_index_fts f on t.thread_id = f.thread_id
        where f.thread_index_fts match $query
        ${filterSql}
        order by t.created_at desc
        limit $limit offset $offset
      `
      return this.db.prepare(sql).all(params as any) as ThreadIndexRow[]
    }

    const sql = `
      select t.* from thread_index t
      where 1 = 1
      ${filterSql}
      order by t.created_at desc
      limit $limit offset $offset
    `
    return this.db.prepare(sql).all(params as any) as ThreadIndexRow[]
  }
}
