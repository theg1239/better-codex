import { Database } from 'bun:sqlite'

export type AnalyticsEvent = {
  occurredAt: number
  dateKey: string
  profileId: string
  eventType: string
  threadId?: string
  turnId?: string
  itemId?: string
  model?: string
  status?: string
  payload?: unknown
}

const toDateKey = (timestampMs: number): string => {
  const date = new Date(timestampMs)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export class AnalyticsStore {
  private readonly db: Database

  constructor(private readonly dbPath: string) {
    this.db = new Database(dbPath)
  }

  init(): void {
    this.db.exec(`
      pragma journal_mode = wal;
      create table if not exists analytics_events (
        id integer primary key autoincrement,
        occurred_at integer not null,
        date_key text not null,
        profile_id text not null,
        thread_id text,
        turn_id text,
        item_id text,
        model text,
        event_type text not null,
        status text,
        payload text
      );
      create index if not exists analytics_events_date on analytics_events(date_key);
      create index if not exists analytics_events_profile on analytics_events(profile_id);
      create index if not exists analytics_events_thread on analytics_events(thread_id);
      create index if not exists analytics_events_type on analytics_events(event_type);

      create table if not exists analytics_daily (
        date_key text not null,
        metric text not null,
        profile_id text not null,
        model text,
        count integer not null default 0,
        primary key (date_key, metric, profile_id, model)
      );

      create table if not exists analytics_thread_meta (
        thread_id text primary key,
        profile_id text not null,
        model text,
        cwd text,
        created_at integer
      );

      create table if not exists analytics_turn_meta (
        turn_id text primary key,
        thread_id text not null,
        profile_id text not null,
        model text,
        started_at integer,
        completed_at integer,
        status text
      );

      create table if not exists analytics_token_usage (
        id integer primary key autoincrement,
        occurred_at integer not null,
        date_key text not null,
        profile_id text not null,
        thread_id text not null,
        payload text
      );

      create table if not exists analytics_approvals (
        request_id integer primary key,
        profile_id text not null,
        thread_id text,
        item_id text,
        approval_type text not null,
        requested_at integer not null,
        decision text,
        decided_at integer
      );
    `)
  }

  recordEvent(event: AnalyticsEvent): void {
    const payload = event.payload ? safeStringify(event.payload) : null
    this.db
      .prepare(
        `insert into analytics_events
          (occurred_at, date_key, profile_id, thread_id, turn_id, item_id, model, event_type, status, payload)
        values
          ($occurred_at, $date_key, $profile_id, $thread_id, $turn_id, $item_id, $model, $event_type, $status, $payload)
        `
      )
      .run({
        $occurred_at: event.occurredAt,
        $date_key: event.dateKey,
        $profile_id: event.profileId,
        $thread_id: event.threadId ?? null,
        $turn_id: event.turnId ?? null,
        $item_id: event.itemId ?? null,
        $model: event.model ?? null,
        $event_type: event.eventType,
        $status: event.status ?? null,
        $payload: payload,
      })
  }

  incrementDaily(metric: string, profileId: string, model?: string, occurredAt = Date.now()): void {
    const dateKey = toDateKey(occurredAt)
    this.db
      .prepare(
        `insert into analytics_daily (date_key, metric, profile_id, model, count)
         values ($date_key, $metric, $profile_id, $model, 0)
         on conflict(date_key, metric, profile_id, model) do nothing
        `
      )
      .run({
        $date_key: dateKey,
        $metric: metric,
        $profile_id: profileId,
        $model: model ?? null,
      })

    this.db
      .prepare(
        `update analytics_daily
         set count = count + 1
         where date_key = $date_key and metric = $metric and profile_id = $profile_id and model is $model
        `
      )
      .run({
        $date_key: dateKey,
        $metric: metric,
        $profile_id: profileId,
        $model: model ?? null,
      })
  }

  upsertThreadMeta(threadId: string, profileId: string, model?: string, cwd?: string, createdAt?: number): void {
    this.db
      .prepare(
        `insert into analytics_thread_meta (thread_id, profile_id, model, cwd, created_at)
         values ($thread_id, $profile_id, $model, $cwd, $created_at)
         on conflict(thread_id) do update set
           profile_id = excluded.profile_id,
           model = coalesce(excluded.model, analytics_thread_meta.model),
           cwd = coalesce(excluded.cwd, analytics_thread_meta.cwd),
           created_at = coalesce(excluded.created_at, analytics_thread_meta.created_at)
        `
      )
      .run({
        $thread_id: threadId,
        $profile_id: profileId,
        $model: model ?? null,
        $cwd: cwd ?? null,
        $created_at: createdAt ?? null,
      })
  }

  upsertTurnMeta(turnId: string, threadId: string, profileId: string, model?: string, startedAt?: number, completedAt?: number, status?: string): void {
    this.db
      .prepare(
        `insert into analytics_turn_meta (turn_id, thread_id, profile_id, model, started_at, completed_at, status)
         values ($turn_id, $thread_id, $profile_id, $model, $started_at, $completed_at, $status)
         on conflict(turn_id) do update set
           model = coalesce(excluded.model, analytics_turn_meta.model),
           started_at = coalesce(excluded.started_at, analytics_turn_meta.started_at),
           completed_at = coalesce(excluded.completed_at, analytics_turn_meta.completed_at),
           status = coalesce(excluded.status, analytics_turn_meta.status)
        `
      )
      .run({
        $turn_id: turnId,
        $thread_id: threadId,
        $profile_id: profileId,
        $model: model ?? null,
        $started_at: startedAt ?? null,
        $completed_at: completedAt ?? null,
        $status: status ?? null,
      })
  }

  recordTokenUsage(profileId: string, threadId: string, payload: unknown, occurredAt = Date.now()): void {
    this.db
      .prepare(
        `insert into analytics_token_usage (occurred_at, date_key, profile_id, thread_id, payload)
         values ($occurred_at, $date_key, $profile_id, $thread_id, $payload)
        `
      )
      .run({
        $occurred_at: occurredAt,
        $date_key: toDateKey(occurredAt),
        $profile_id: profileId,
        $thread_id: threadId,
        $payload: safeStringify(payload),
      })
  }

  recordApprovalRequest(requestId: number, profileId: string, approvalType: string, threadId?: string, itemId?: string): void {
    this.db
      .prepare(
        `insert into analytics_approvals (request_id, profile_id, thread_id, item_id, approval_type, requested_at)
         values ($request_id, $profile_id, $thread_id, $item_id, $approval_type, $requested_at)
         on conflict(request_id) do nothing
        `
      )
      .run({
        $request_id: requestId,
        $profile_id: profileId,
        $thread_id: threadId ?? null,
        $item_id: itemId ?? null,
        $approval_type: approvalType,
        $requested_at: Date.now(),
      })
  }

  recordApprovalDecision(requestId: number, decision: string): void {
    this.db
      .prepare(
        `update analytics_approvals
         set decision = $decision, decided_at = $decided_at
         where request_id = $request_id
        `
      )
      .run({
        $decision: decision,
        $decided_at: Date.now(),
        $request_id: requestId,
      })
  }

  getDailySeries(metric: string, profileId?: string, model?: string, days = 365): Array<{ date: string; count: number }> {
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - days + 1)
    const cutoffKey = toDateKey(cutoff.getTime())

    const rows = this.db
      .prepare(
        `select date_key as date, count
         from analytics_daily
         where metric = $metric
           and date_key >= $cutoff
           and ($profile_id is null or profile_id = $profile_id)
           and ($model is null or model = $model)
         order by date_key asc
        `
      )
      .all({
        $metric: metric,
        $cutoff: cutoffKey,
        $profile_id: profileId ?? null,
        $model: model ?? null,
      }) as Array<{ date: string; count: number }>

    return rows
  }
}

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const deriveDateKey = toDateKey
