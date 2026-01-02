import { useEffect, useRef } from 'react'
import { hubClient } from '../services/hub-client'
import { useAppStore } from '../store'
import type { Message, ReasoningEffort } from '../types'
import { buildSystemMessage } from '../utils/item-format'
import { normalizeApprovalPolicy } from '../utils/approval-policy'

type ThreadResumeResult = {
  thread?: ThreadData
  model?: string
  reasoningEffort?: ReasoningEffort | null
  approvalPolicy?: string | null
  cwd?: string | null
}

type ThreadData = {
  id: string
  preview?: string
  modelProvider?: string
  createdAt?: number
  turns?: TurnData[]
}

type TurnData = {
  id: string
  items?: ThreadItem[]
  status?: string
}

type ThreadItem = {
  type: string
  id: string
  content?: UserInput[]
  text?: string
  summary?: string[]
  changes?: Array<{ path?: string; kind?: string; diff?: string }>
  command?: string
  aggregatedOutput?: string
  status?: string
  server?: string
  tool?: string
  arguments?: unknown
  result?: unknown
  error?: unknown
  query?: string
}

type UserInput =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'localImage'; path: string }

const toUserContent = (content: UserInput[] = []) => {
  const parts = content
    .map((input) => {
      if (input.type === 'text') {
        return input.text
      }
      if (input.type === 'image') {
        return `[image: ${input.url}]`
      }
      if (input.type === 'localImage') {
        return `[image: ${input.path}]`
      }
      return ''
    })
    .filter((part) => part.trim().length > 0)

  return parts.join('\n')
}

const buildMessagesFromTurns = (turns: TurnData[] = []): Message[] => {
  const messages: Message[] = []
  turns.forEach((turn) => {
    turn.items?.forEach((item) => {
      if (item.type === 'userMessage') {
        const content = toUserContent(item.content ?? [])
        if (!content) {
          return
        }
        messages.push({
          id: item.id,
          role: 'user',
          content,
          kind: 'chat',
          timestamp: '',
        })
      }

      if (item.type === 'agentMessage') {
        if (!item.text?.trim()) {
          return
        }
        messages.push({
          id: item.id,
          role: 'assistant',
          content: item.text,
          kind: 'chat',
          timestamp: '',
        })
        return
      }

      const systemMessage = buildSystemMessage(item)
      if (systemMessage) {
        messages.push(systemMessage)
      }
    })
  })
  return messages
}

const mergeMessages = (base: Message[], incoming: Message[]): Message[] => {
  if (incoming.length === 0) {
    return base
  }
  if (base.length === 0) {
    return incoming
  }
  const merged = [...base]
  const indexById = new Map(base.map((msg, index) => [msg.id, index]))
  const userContentIndex = new Map<string, number[]>()

  const contentKey = (message: Message) => message.content.trim()
  const isUserChat = (message: Message) => message.role === 'user' && message.kind === 'chat'

  base.forEach((message, index) => {
    if (!isUserChat(message) || message.timestamp) {
      return
    }
    const key = contentKey(message)
    if (!key) {
      return
    }
    const existing = userContentIndex.get(key)
    if (existing) {
      existing.push(index)
    } else {
      userContentIndex.set(key, [index])
    }
  })

  for (const message of incoming) {
    const existingIndex = indexById.get(message.id)
    if (existingIndex === undefined) {
      if (isUserChat(message)) {
        const key = contentKey(message)
        const candidates = key ? userContentIndex.get(key) : undefined
        const targetIndex = candidates?.shift()
        if (targetIndex !== undefined) {
          const target = merged[targetIndex]
          merged[targetIndex] = {
            ...target,
            ...message,
            id: target.id,
            timestamp: message.timestamp || target.timestamp,
          }
          if (candidates && candidates.length === 0) {
            userContentIndex.delete(key)
          }
          continue
        }
      }
      merged.push(message)
    } else {
      merged[existingIndex] = { ...merged[existingIndex], ...message }
    }
  }
  return merged
}

const isTurnInProgress = (status?: string) => {
  if (!status) {
    return false
  }
  return status === 'inProgress' || status === 'in_progress' || status === 'inprogress'
}

export const useThreadHistory = () => {
  const {
    threads,
    selectedThreadId,
    messages,
    connectionStatus,
    setMessagesForThread,
    updateThread,
    setThreadModel,
    setThreadEffort,
    setThreadApproval,
    setThreadCwd,
    setThreadTurnId,
  } = useAppStore()

  const inFlight = useRef<Set<string>>(new Set())
  const loaded = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!selectedThreadId || connectionStatus !== 'connected') {
      return
    }

    const thread = threads.find((item) => item.id === selectedThreadId)
    if (!thread) {
      return
    }

    if (loaded.current.has(selectedThreadId)) {
      return
    }

    if (inFlight.current.has(selectedThreadId)) {
      return
    }

    let cancelled = false

    const loadHistory = async () => {
      inFlight.current.add(selectedThreadId)
      try {
        const result = (await hubClient.request(thread.accountId, 'thread/resume', {
          threadId: selectedThreadId,
        })) as ThreadResumeResult

        if (cancelled) {
          return
        }

        const resumeThread = result.thread
        if (!resumeThread) {
          return
        }

        const turns = resumeThread.turns ?? []
        const loadedMessages = buildMessagesFromTurns(turns)
        const currentMessages = useAppStore.getState().messages[selectedThreadId] ?? []
        const mergedMessages = mergeMessages(loadedMessages, currentMessages)
        setMessagesForThread(selectedThreadId, mergedMessages)

        let activeTurn: TurnData | null = null
        for (let index = turns.length - 1; index >= 0; index -= 1) {
          if (isTurnInProgress(turns[index]?.status)) {
            activeTurn = turns[index]
            break
          }
        }
        setThreadTurnId(selectedThreadId, activeTurn?.id ?? null)
        const nextStatus = thread.status === 'archived'
          ? 'archived'
          : activeTurn
            ? 'active'
            : 'idle'

        updateThread(selectedThreadId, {
          title: resumeThread.preview?.trim() || thread.title,
          preview: resumeThread.preview?.trim() || thread.preview,
          model: resumeThread.modelProvider ?? thread.model,
          messageCount: mergedMessages.length,
          status: nextStatus,
        })
        if (result.model) {
          setThreadModel(selectedThreadId, result.model)
        }
        if (result.reasoningEffort) {
          setThreadEffort(selectedThreadId, result.reasoningEffort)
        }
        const approvalPolicy = normalizeApprovalPolicy(result.approvalPolicy)
        if (approvalPolicy) {
          setThreadApproval(selectedThreadId, approvalPolicy)
        }
        if (result.cwd) {
          setThreadCwd(selectedThreadId, result.cwd)
        }
        loaded.current.add(selectedThreadId)
      } catch (error) {
        console.error(error)
      } finally {
        inFlight.current.delete(selectedThreadId)
      }
    }

    loadHistory()

    return () => {
      cancelled = true
    }
  }, [
    connectionStatus,
    messages,
    selectedThreadId,
    setMessagesForThread,
    setThreadModel,
    setThreadEffort,
    setThreadApproval,
    threads,
    updateThread,
    setThreadTurnId,
    setThreadCwd,
  ])
}
