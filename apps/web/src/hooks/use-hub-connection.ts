import { useEffect } from 'react'
import { hubClient, type HubProfile } from '../services/hub-client'
import { useAppStore } from '../store'
import type { Account, Thread } from '../types'
import { buildSystemMessage } from '../utils/item-format'
import { accountStatusFromRead, parseUsage, refreshAccountSnapshot, fetchAllModels, type AccountReadResult, type RateLimitResult } from '../utils/account-refresh'

type ThreadListResult = {
  data?: Array<{
    id: string
    preview?: string
    modelProvider?: string
    createdAt?: number
  }>
}

type ItemPayload = { id?: string; type?: string } & Record<string, unknown>

const isThreadItem = (item: ItemPayload | undefined): item is { id: string; type: string } & Record<string, unknown> =>
  !!item && typeof item.id === 'string' && typeof item.type === 'string'

const formatDate = (timestamp?: number): string => {
  if (!timestamp) {
    return ''
  }
  const date = new Date(timestamp * 1000)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

const toAccount = (profile: HubProfile): Account => ({
  id: profile.id,
  name: profile.name,
  email: '',
  plan: 'Unknown',
  status: 'offline',
  rateLimit: 0,
})

const toThreads = (profileId: string, result: ThreadListResult): Thread[] => {
  const items = result.data ?? []
  return items.map((thread) => ({
    id: thread.id,
    accountId: profileId,
    title: thread.preview?.trim() || 'Untitled session',
    preview: thread.preview?.trim() || 'No preview available yet.',
    model: thread.modelProvider ?? 'unknown',
    createdAt: formatDate(thread.createdAt),
    status: 'idle',
    messageCount: 0,
  }))
}

export const useHubConnection = () => {
  const {
    setConnectionStatus,
    setAccounts,
    updateAccount,
    setThreadsForAccount,
    addApproval,
    addMessage,
    appendMessageDelta,
    upsertMessage,
    ensureAssistantMessage,
    setModelsForAccount,
    updateThread,
    setSelectedAccountId,
    setSelectedThreadId,
    shiftQueuedMessage,
    enqueueMessage,
    setMessagesForThread,
    setThreadTurnId,
    setThreadTurnStartedAt,
    setThreadLastTurnDuration,
    setThreadTokenUsage,
    setAccountLoginId,
    upsertReviewSession,
    updateReviewSession,
  } = useAppStore()

  const nowTimestamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const addSystemMessage = (threadId: string, title: string, content: string) => {
    addMessage(threadId, {
      id: `sys-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role: 'assistant',
      kind: 'tool',
      title,
      content,
      timestamp: nowTimestamp(),
    })
  }

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | null = null

    const safeRequest = async <T,>(
      profileId: string,
      method: string,
      params?: unknown
    ): Promise<T | null> => {
      try {
        return (await hubClient.request(profileId, method, params)) as T
      } catch (error) {
        console.error(error)
        return null
      }
    }

    const refreshAccount = async (profileId: string) => {
      try {
        await refreshAccountSnapshot(profileId, updateAccount, setModelsForAccount)
      } catch (error) {
        console.error(error)
        updateAccount(profileId, (prev) => ({ ...prev, status: 'degraded' }))
      }
    }

    const dispatchQueuedMessage = async (profileId: string, threadId: string) => {
      const next = shiftQueuedMessage(threadId)
      if (!next) {
        return
      }
      const state = useAppStore.getState()
      const account = state.accounts.find((item) => item.id === profileId)
      if (!account || account.status !== 'online' || state.connectionStatus !== 'connected') {
        enqueueMessage(threadId, next)
        return
      }
      addMessage(threadId, {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: next.text,
        kind: 'chat',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
      updateThread(threadId, { status: 'active' })
      try {
        await hubClient.request(profileId, 'turn/start', {
          threadId,
          input: [{ type: 'text', text: next.text }],
          model: next.model,
          effort: next.effort ?? undefined,
          summary: next.summary ?? undefined,
          cwd: next.cwd ?? undefined,
          approvalPolicy: next.approvalPolicy ?? undefined,
        })
      } catch (error) {
        console.error(error)
        enqueueMessage(threadId, next)
        updateThread(threadId, { status: 'idle' })
      }
    }

    const bootstrap = async () => {
      try {
        setConnectionStatus('connecting')
        const profiles = await hubClient.listProfiles()
        if (disposed) {
          return
        }
        setAccounts(profiles.map(toAccount))
        if (profiles.length > 0) {
          setSelectedAccountId(profiles[0].id)
        }

        await hubClient.connect()
        if (disposed) {
          return
        }
        setConnectionStatus('connected')

        unsubscribe = hubClient.onEvent((event) => {
          // console.log('[HubConnection] Event received:', event.type, 'type' in event && event.type === 'rpc.event' ? (event as {method?: string}).method : '')
          if (event.type === 'rpc.event') {
            const { method, params, profileId } = event
            if (method === 'account/updated' && params && typeof params === 'object') {
              void refreshAccount(profileId)
            }

            if (method === 'account/login/completed' && params && typeof params === 'object') {
              // console.log('[HubConnection] Login completed for:', profileId, params)
              const { success } = params as { success?: boolean }
              setAccountLoginId(profileId, null)
              if (!success) {
                updateAccount(profileId, (prev) => ({
                  ...prev,
                  status: 'offline',
                }))
                return
              }
              void refreshAccount(profileId)
            }

            if (method === 'account/rateLimits/updated' && params && typeof params === 'object') {
              const usage = parseUsage({ rateLimits: (params as RateLimitResult).rateLimits })
              const rate = usage?.primary?.usedPercent
              updateAccount(profileId, (prev) => ({
                ...prev,
                rateLimit: typeof rate === 'number' ? Math.round(rate) : prev.rateLimit,
                usage: usage ?? prev.usage,
              }))
            }

            if (method === 'mcpServer/oauthLogin/completed' && params && typeof params === 'object') {
              const { name, success, error } = params as { name?: string; success?: boolean; error?: string }
              const selectedThreadId = useAppStore.getState().selectedThreadId
              if (selectedThreadId) {
                addSystemMessage(
                  selectedThreadId,
                  'MCP Login',
                  success ? `${name ?? 'Server'} connected.` : `${name ?? 'Server'} login failed: ${error ?? 'Unknown error'}`
                )
              }
            }

            if (method === 'thread/started' && params && typeof params === 'object') {
              const thread = (params as { thread?: { id: string; preview?: string; modelProvider?: string; createdAt?: number } }).thread
              if (thread) {
                // Initialize empty messages array FIRST to prevent thread/resume being called
                const currentMessages = useAppStore.getState().messages
                if (currentMessages[thread.id] === undefined) {
                  setMessagesForThread(thread.id, [])
                }
                updateThread(thread.id, {
                  accountId: profileId,
                  title: thread.preview?.trim() || 'Untitled session',
                  preview: thread.preview?.trim() || 'No preview available yet.',
                  model: thread.modelProvider ?? 'unknown',
                  createdAt: formatDate(thread.createdAt),
                  status: 'idle',
                  messageCount: 0,
                })
              }
            }

            if (method === 'turn/started' && params && typeof params === 'object') {
              const { threadId, turn } = params as { threadId?: string; turn?: { id?: string } }
              if (threadId) {
                updateThread(threadId, { status: 'active' })
                setThreadTurnStartedAt(threadId, Date.now())
                if (turn?.id) {
                  setThreadTurnId(threadId, turn.id)
                }
              }
            }

            if (method === 'turn/completed' && params && typeof params === 'object') {
              const { threadId, turn } = params as { threadId?: string; turn?: { id?: string; status?: string } }
              // console.log('[HubConnection] turn/completed event for thread:', threadId)
              if (threadId) {
                const startedAt = useAppStore.getState().threadTurnStartedAt[threadId]
                if (startedAt) {
                  const duration = Math.floor((Date.now() - startedAt) / 1000)
                  setThreadLastTurnDuration(threadId, duration)
                }
                updateThread(threadId, { status: 'idle' })                
                setThreadTurnId(threadId, null)
                setThreadTurnStartedAt(threadId, null)
                void dispatchQueuedMessage(profileId, threadId)
              }
              if (turn?.id && turn.status) {
                updateReviewSession(turn.id, {
                  status: turn.status === 'failed' ? 'failed' : 'completed',
                  completedAt: Date.now(),
                })
              }
            }

            if (method === 'turn/diff/updated' && params && typeof params === 'object') {
              const { threadId, turnId, diff } = params as { threadId?: string; turnId?: string; diff?: string }
              if (threadId && diff) {
                const content = diff.length > 4000 ? `${diff.slice(0, 4000)}\n…` : diff
                upsertMessage(threadId, {
                  id: `diff-${turnId ?? threadId}`,
                  role: 'assistant',
                  kind: 'file',
                  title: 'Diff',
                  content,
                  meta: { diff },
                  timestamp: nowTimestamp(),
                })
              }
            }

            if (method === 'turn/plan/updated' && params && typeof params === 'object') {
              const { threadId, turnId, plan, explanation } = params as {
                threadId?: string
                turnId?: string
                plan?: Array<{ step?: string; status?: string }>
                explanation?: string
              }
              if (threadId && Array.isArray(plan)) {
                const steps = plan
                  .map((entry) => `${entry.status ?? 'pending'} · ${entry.step ?? ''}`.trim())
                  .filter(Boolean)
                  .join('\n')
                const content = [explanation, steps].filter(Boolean).join('\n\n')
                upsertMessage(threadId, {
                  id: `plan-${turnId ?? threadId}`,
                  role: 'assistant',
                  kind: 'tool',
                  title: 'Plan',
                  content: content || 'Plan updated.',
                  timestamp: nowTimestamp(),
                })
              }
            }

            if (method === 'thread/tokenUsage/updated' && params && typeof params === 'object') {
              const { threadId } = params as { threadId?: string }
              const usage = (params as { usage?: unknown }).usage ?? (params as { tokenUsage?: unknown }).tokenUsage
              if (threadId && usage) {
                setThreadTokenUsage(threadId, usage)
              }
            }

            if (method === 'item/agentMessage/delta' && params && typeof params === 'object') {
              const { threadId, itemId, delta } = params as {
                threadId?: string
                itemId?: string
                delta?: string
              }
              if (threadId && itemId && delta) {
                appendMessageDelta(threadId, itemId, delta)
              }
            }

            if (method === 'item/reasoning/summaryTextDelta' && params && typeof params === 'object') {
              const { threadId, itemId, delta } = params as {
                threadId?: string
                itemId?: string
                delta?: string
              }
              if (threadId && itemId && delta) {
                appendMessageDelta(threadId, itemId, delta)
              }
            }

            if (method === 'item/reasoning/summaryPartAdded' && params && typeof params === 'object') {
              const { threadId, itemId } = params as { threadId?: string; itemId?: string }
              if (threadId && itemId) {
                appendMessageDelta(threadId, itemId, '\n\n')
              }
            }

            if (method === 'item/reasoning/textDelta' && params && typeof params === 'object') {
              const { threadId, itemId, delta } = params as {
                threadId?: string
                itemId?: string
                delta?: string
              }
              if (threadId && itemId && delta) {
                appendMessageDelta(threadId, itemId, delta)
              }
            }

            if (method === 'item/commandExecution/outputDelta' && params && typeof params === 'object') {
              const { threadId, itemId, delta } = params as {
                threadId?: string
                itemId?: string
                delta?: string
              }
              if (threadId && itemId && delta) {
                appendMessageDelta(threadId, itemId, delta)
              }
            }

            if (method === 'item/fileChange/outputDelta' && params && typeof params === 'object') {
              const { threadId, itemId, delta } = params as {
                threadId?: string
                itemId?: string
                delta?: string
              }
              if (threadId && itemId && delta) {
                appendMessageDelta(threadId, itemId, delta)
              }
            }

            if (method === 'item/started' && params && typeof params === 'object') {
              const { item, threadId, turnId } = params as {
                item?: ItemPayload & { review?: string }
                threadId?: string
                turnId?: string
              }
              if (threadId && item?.type === 'agentMessage' && item.id) {
                ensureAssistantMessage(threadId, item.id)
                return
              }
              if (threadId && item?.type === 'enteredReviewMode') {
                const sessionId = turnId ?? item.id ?? `review-${Date.now()}`
                upsertReviewSession({
                  id: sessionId,
                  threadId,
                  profileId,
                  status: 'running',
                  startedAt: Date.now(),
                  label: typeof item.review === 'string' ? item.review : 'Review',
                })
              }
              if (threadId && isThreadItem(item)) {
                const systemMessage = buildSystemMessage(item)
                if (systemMessage) {
                  systemMessage.timestamp = nowTimestamp()
                  upsertMessage(threadId, systemMessage)
                }
              }
            }

            if (method === 'item/completed' && params && typeof params === 'object') {
              const { item, threadId, turnId } = params as {
                item?: ItemPayload & { review?: string }
                threadId?: string
                turnId?: string
              }
              if (threadId && item?.type === 'exitedReviewMode') {
                const sessionId = turnId ?? item.id
                if (sessionId) {
                  updateReviewSession(sessionId, {
                    status: 'completed',
                    completedAt: Date.now(),
                    review: typeof item.review === 'string' ? item.review : undefined,
                  })
                }
              }
              if (threadId && isThreadItem(item)) {
                const systemMessage = buildSystemMessage(item)
                if (systemMessage) {
                  systemMessage.timestamp = nowTimestamp()
                  upsertMessage(threadId, systemMessage)
                }
              }
            }

            if (method === 'error' && params && typeof params === 'object') {
              const { threadId, error } = params as { threadId?: string; error?: { message?: string } }
              if (threadId) {
                const message = error?.message ?? 'Unknown error.'
                addSystemMessage(threadId, 'Error', message)
              }
            }
          }

          if (event.type === 'profile.exit') {
            updateAccount(event.profileId, (prev) => ({
              ...prev,
              status: 'offline',
            }))
          }

          if (event.type === 'profile.error') {
            updateAccount(event.profileId, (prev) => ({
              ...prev,
              status: 'degraded',
            }))
          }

          if (event.type === 'rpc.serverRequest') {
            const { method, params, profileId, id } = event
            if (method === 'item/commandExecution/requestApproval' && params && typeof params === 'object') {
              const parsed = params as {
                itemId?: string
                threadId?: string
                parsedCmd?: string
                command?: string[]
              }
              addApproval({
                id: parsed.itemId ?? String(id),
                requestId: id,
                profileId,
                threadId: parsed.threadId ?? '',
                type: 'command',
                payload: parsed.parsedCmd ?? parsed.command?.join(' ') ?? 'Command approval required',
                status: 'pending',
              })
            }

            if (method === 'item/fileChange/requestApproval' && params && typeof params === 'object') {
              const parsed = params as {
                itemId?: string
                threadId?: string
                reason?: string
              }
              addApproval({
                id: parsed.itemId ?? String(id),
                requestId: id,
                profileId,
                threadId: parsed.threadId ?? '',
                type: 'file',
                payload: parsed.reason ?? 'File changes requested',
                status: 'pending',
              })
            }
          }
        })

        for (const profile of profiles) {
          await hubClient.startProfile(profile.id)

          const accountResult = await safeRequest<AccountReadResult>(
            profile.id,
            'account/read',
            { refreshToken: false }
          )
          if (accountResult) {
            updateAccount(profile.id, (prev) => ({
              ...prev,
              status: accountStatusFromRead(accountResult),
              email: accountResult.account?.email ?? prev.email,
              plan: accountResult.account?.planType ?? prev.plan,
            }))
          } else {
            updateAccount(profile.id, (prev) => ({
              ...prev,
              status: 'degraded',
            }))
          }

          const limits = await safeRequest<RateLimitResult>(
            profile.id,
            'account/rateLimits/read'
          )
          if (limits) {
            const usage = parseUsage(limits)
            const rate = usage?.primary?.usedPercent
            updateAccount(profile.id, (prev) => ({
              ...prev,
              rateLimit: typeof rate === 'number' ? Math.round(rate) : prev.rateLimit,
              usage,
            }))
          }

          const threads = await safeRequest<ThreadListResult>(profile.id, 'thread/list', {
            limit: 50,
          })
          if (threads) {
            setThreadsForAccount(profile.id, toThreads(profile.id, threads))
            if (profile.id === profiles[0]?.id && threads.data?.length) {
              setSelectedThreadId(threads.data[0].id)
            }
          }
          if (threads?.data?.length) {
            try {
              const activeThreads = await hubClient.listActiveThreads({ profileId: profile.id })
              const knownThreadIds = new Set(threads.data.map((thread) => thread.id))
              for (const entry of activeThreads) {
                if (!knownThreadIds.has(entry.threadId)) {
                  continue
                }
                updateThread(entry.threadId, { status: 'active' })
                if (entry.turnId) {
                  setThreadTurnId(entry.threadId, entry.turnId)
                }
                if (Number.isFinite(entry.startedAt)) {
                  setThreadTurnStartedAt(entry.threadId, entry.startedAt)
                }
              }
            } catch (error) {
              console.error(error)
            }
          }

          const models = await fetchAllModels(profile.id)
          if (models.length) {
            setModelsForAccount(profile.id, models)
          }
        }
      } catch (error) {
        console.error(error)
        setConnectionStatus('error')
      }
    }

    bootstrap()

    return () => {
      disposed = true
      unsubscribe?.()
      hubClient.disconnect()
    }
  }, [
    addApproval,
    addMessage,
    appendMessageDelta,
    upsertMessage,
    ensureAssistantMessage,
    enqueueMessage,
    setAccounts,
    setAccountLoginId,
    setConnectionStatus,
    setModelsForAccount,
    setSelectedAccountId,
    setSelectedThreadId,
    shiftQueuedMessage,
    setThreadsForAccount,
    setThreadTokenUsage,
    setThreadTurnId,
    setThreadTurnStartedAt,
    setThreadLastTurnDuration,
    updateAccount,
    upsertReviewSession,
    updateReviewSession,
    updateThread,
  ])
}
