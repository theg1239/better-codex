import type { Account, AccountStatus, AccountUsage, ModelInfo } from '../types'
import { hubClient } from '../services/hub-client'

export type AccountReadResult = {
  account?: {
    type: string
    email?: string
    planType?: string
  } | null
  requiresOpenaiAuth?: boolean
}

type RateLimitWindowRaw = {
  used_percent?: number
  usedPercent?: number
  window_minutes?: number | null
  windowDurationMins?: number | null
  resets_at?: number | null
  resetsAt?: number | null
}

type CreditsSnapshotRaw = {
  has_credits?: boolean
  hasCredits?: boolean
  unlimited?: boolean
  balance?: string | null
}

export type RateLimitResult = {
  rateLimits?: {
    primary?: RateLimitWindowRaw | null
    secondary?: RateLimitWindowRaw | null
    credits?: CreditsSnapshotRaw | null
    plan_type?: string | null
    planType?: string | null
  } | null
}

type ModelListResult = {
  data?: ModelInfo[]
  nextCursor?: string | null
}

const readNumber = (...values: Array<number | null | undefined>) => {
  for (const value of values) {
    if (typeof value === 'number') {
      return value
    }
  }
  return 0
}

const readNumberOrNull = (...values: Array<number | null | undefined>) => {
  for (const value of values) {
    if (typeof value === 'number') {
      return value
    }
  }
  return null
}

export const parseUsage = (result: RateLimitResult): AccountUsage | undefined => {
  const limits = result.rateLimits
  if (!limits) return undefined
  return {
    primary: limits.primary ? {
      usedPercent: readNumber(limits.primary.usedPercent, limits.primary.used_percent),
      windowMinutes: readNumberOrNull(
        limits.primary.windowDurationMins,
        limits.primary.window_minutes
      ),
      resetsAt: readNumberOrNull(limits.primary.resetsAt, limits.primary.resets_at),
    } : null,
    secondary: limits.secondary ? {
      usedPercent: readNumber(limits.secondary.usedPercent, limits.secondary.used_percent),
      windowMinutes: readNumberOrNull(
        limits.secondary.windowDurationMins,
        limits.secondary.window_minutes
      ),
      resetsAt: readNumberOrNull(limits.secondary.resetsAt, limits.secondary.resets_at),
    } : null,
    credits: limits.credits ? {
      hasCredits: limits.credits.hasCredits ?? limits.credits.has_credits ?? false,
      unlimited: limits.credits.unlimited ?? false,
      balance: limits.credits.balance ?? null,
    } : null,
    planType: limits.planType ?? limits.plan_type ?? null,
  }
}

export const accountStatusFromRead = (result: AccountReadResult): AccountStatus => {
  if (!result.account) {
    return result.requiresOpenaiAuth ? 'offline' : 'online'
  }
  return 'online'
}

export const fetchAllModels = async (profileId: string): Promise<ModelInfo[]> => {
  if (!hubClient.isConnected()) {
    return []
  }
  const models: ModelInfo[] = []
  let cursor: string | null = null
  for (let page = 0; page < 10; page += 1) {
    if (!hubClient.isConnected()) {
      return models
    }
    let result: ModelListResult | null = null
    try {
      result = (await hubClient.request(profileId, 'model/list', {
        limit: 100,
        cursor,
      })) as ModelListResult
    } catch {
      return models
    }
    if (!result?.data?.length) {
      break
    }
    models.push(...result.data)
    if (!result.nextCursor || result.nextCursor === cursor) {
      break
    }
    cursor = result.nextCursor
  }
  return models
}

export const refreshAccountSnapshot = async (
  profileId: string,
  updateAccount: (id: string, updater: (account: Account) => Account) => void,
  setModelsForAccount: (id: string, models: ModelInfo[]) => void
): Promise<void> => {
  if (!hubClient.isConnected()) {
    return
  }
  let accountResult: AccountReadResult | null = null
  try {
    accountResult = (await hubClient.request(profileId, 'account/read', {
      refreshToken: false,
    })) as AccountReadResult
  } catch {
    accountResult = null
  }
  if (accountResult) {
    updateAccount(profileId, (prev) => ({
      ...prev,
      status: accountStatusFromRead(accountResult),
      email: accountResult.account?.email ?? prev.email,
      plan: accountResult.account?.planType ?? prev.plan,
    }))
  }

  try {
    const limits = (await hubClient.request(profileId, 'account/rateLimits/read')) as RateLimitResult
    if (limits) {
      const usage = parseUsage(limits)
      const rate = usage?.primary?.usedPercent
      updateAccount(profileId, (prev) => ({
        ...prev,
        rateLimit: typeof rate === 'number' ? Math.round(rate) : prev.rateLimit,
        usage: usage ?? prev.usage,
      }))
    }
  } catch {
    // Ignore rate limit errors for unauthenticated accounts.
  }

  try {
    const models = await fetchAllModels(profileId)
    if (models.length) {
      setModelsForAccount(profileId, models)
    }
  } catch {
    // Ignore model errors for unauthenticated accounts.
  }
}
