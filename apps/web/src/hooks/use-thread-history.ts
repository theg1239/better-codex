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
  } = useAppStore()

  const inFlight = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!selectedThreadId || connectionStatus !== 'connected') {
      return
    }

    const thread = threads.find((item) => item.id === selectedThreadId)
    if (!thread) {
      return
    }

    const existing = messages[selectedThreadId]
    if (existing !== undefined) {
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

        const loadedMessages = buildMessagesFromTurns(resumeThread.turns)
        setMessagesForThread(selectedThreadId, loadedMessages)

        updateThread(selectedThreadId, {
          title: resumeThread.preview?.trim() || thread.title,
          preview: resumeThread.preview?.trim() || thread.preview,
          model: resumeThread.modelProvider ?? thread.model,
          messageCount: loadedMessages.length,
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
  ])
}
