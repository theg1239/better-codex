import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Message, ApprovalRequest, ThreadStatus, QueuedMessage, CommandAction, FileChangeMeta } from '../../types'
import { Avatar, Button, Icons, CollapsibleContent, ThinkingIndicator, ShimmerText } from '../ui'
import { Markdown } from '../ui'

interface VirtualizedMessageListProps {
  messages: Message[]
  approvals: ApprovalRequest[]
  queuedMessages: QueuedMessage[]
  threadStatus?: ThreadStatus
  turnStartedAt?: number
  lastTurnDuration?: number
  onApprove: (approval: ApprovalRequest) => void
  onApproveForSession?: (approval: ApprovalRequest) => void
  onDeny: (approval: ApprovalRequest) => void
  onInterrupt?: () => void
}

interface Turn {
  id: string
  userMessage?: Message
  assistantActions: AssistantAction[]
  timestamp: string
}

interface AssistantAction {
  type: 'chat' | 'reasoning' | 'explored' | 'edited' | 'ran' | 'searched'
  messages: Message[]
  label: string
  summary?: string
}

type ActionRowItem = {
  label: string
  detail: string
}

type FileChangeStat = {
  path: string
  movePath?: string | null
  added: number
  removed: number
  kind: FileChangeMeta['kind']
}

const isInProgressStatus = (value?: string) => {
  if (!value) {
    return false
  }
  const normalized = value.replace(/[_\s]/g, '').toLowerCase()
  return normalized === 'inprogress'
}

const uniqueStrings = (values: string[]) => {
  const set = new Set(values.map((value) => value.trim()).filter(Boolean))
  return Array.from(set)
}

const compactList = (values: string[], maxItems = 3) => {
  const unique = uniqueStrings(values)
  if (unique.length <= maxItems) {
    return unique.join(', ')
  }
  const head = unique.slice(0, maxItems)
  const remaining = unique.length - maxItems
  return `${head.join(', ')} +${remaining}`
}

const isStatusText = (value: string) => {
  const normalized = value.replace(/[_\s]/g, '').toLowerCase()
  return (
    normalized === 'completed' ||
    normalized === 'inprogress' ||
    normalized === 'failed' ||
    normalized === 'declined' ||
    normalized === 'canceled' ||
    normalized === 'cancelled'
  )
}

const commandActionDetail = (action: CommandAction) => {
  switch (action.type) {
    case 'read':
      return action.name || action.path || action.command
    case 'listFiles':
      return action.path || action.command
    case 'search': {
      const query = action.query || action.command
      if (action.path) {
        return `${query} in ${action.path}`
      }
      return query
    }
    default:
      return action.command
  }
}

const buildCommandActionRows = (messages: Message[]): ActionRowItem[] => {
  const rows: ActionRowItem[] = []
  let pendingReads: string[] = []

  const flushReads = () => {
    if (!pendingReads.length) {
      return
    }
    const detail = compactList(pendingReads)
    if (!isStatusText(detail)) {
      rows.push({
        label: 'Read',
        detail,
      })
    }
    pendingReads = []
  }

  for (const message of messages) {
    const actions = message.meta?.commandActions ?? []
    if (actions.length) {
      const allRead = actions.every((action) => action.type === 'read')
      if (allRead) {
        pendingReads.push(...actions.map(commandActionDetail))
        continue
      }
      flushReads()
      actions.forEach((action) => {
        const label =
          action.type === 'read'
            ? 'Read'
            : action.type === 'listFiles'
              ? 'List'
            : action.type === 'search'
              ? 'Search'
              : 'Run'
        const detail = commandActionDetail(action)
        if (detail && !isStatusText(detail)) {
          rows.push({ label, detail })
        }
      })
      continue
    }

    flushReads()
    const firstLine = message.content.split('\n')[0]?.trim()
    if (firstLine && !isStatusText(firstLine)) {
      rows.push({ label: 'Result', detail: firstLine })
    }
  }

  flushReads()
  return rows
}

const countDiffLines = (diff: string, kind: FileChangeMeta['kind']) => {
  const lines = diff.split(/\r?\n/u)
  if (kind === 'add') {
    return { added: lines.length, removed: 0 }
  }
  if (kind === 'delete') {
    return { added: 0, removed: lines.length }
  }

  let added = 0
  let removed = 0
  for (const line of lines) {
    if (
      line.startsWith('+++') ||
      line.startsWith('---') ||
      line.startsWith('@@') ||
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('Moved to:')
    ) {
      continue
    }
    if (line.startsWith('+')) {
      added += 1
    } else if (line.startsWith('-')) {
      removed += 1
    }
  }
  return { added, removed }
}

const parseUnifiedDiffStats = (diff: string): FileChangeStat[] => {
  const stats = new Map<string, FileChangeStat>()
  let currentKey: string | null = null

  const ensureEntry = (path: string) => {
    const existing = stats.get(path)
    if (existing) {
      currentKey = path
      return existing
    }
    const created: FileChangeStat = { path, added: 0, removed: 0, kind: 'update' }
    stats.set(path, created)
    currentKey = path
    return created
  }

  for (const line of diff.split(/\r?\n/u)) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/u)
    if (header) {
      ensureEntry(header[2])
      continue
    }
    const plusHeader = line.match(/^\+\+\+\s+(?:b\/)?(.+)$/u)
    if (plusHeader) {
      ensureEntry(plusHeader[1])
      continue
    }
    if (!currentKey) {
      continue
    }
    const current = stats.get(currentKey)
    if (!current) {
      continue
    }
    if (
      line.startsWith('+++') ||
      line.startsWith('---') ||
      line.startsWith('@@') ||
      line.startsWith('index ')
    ) {
      continue
    }
    if (line.startsWith('+')) {
      current.added += 1
    } else if (line.startsWith('-')) {
      current.removed += 1
    }
  }

  return Array.from(stats.values())
}

const parseFileChangesFromContent = (content: string): FileChangeStat[] => {
  const stats: FileChangeStat[] = []
  const lines = content.split(/\r?\n/u)
  for (const line of lines) {
    const match = line.match(/^\s*([a-zA-Z]+)\s*:\s*(.+)$/u)
    if (!match) {
      continue
    }
    const kindRaw = match[1].toLowerCase()
    const detail = match[2].trim()
    const [path, movePath] = detail.split(/\s*->\s*/u)
    const kind =
      kindRaw === 'add' || kindRaw === 'added'
        ? 'add'
        : kindRaw === 'delete' || kindRaw === 'deleted'
          ? 'delete'
          : 'update'
    stats.push({
      path: path.trim(),
      movePath: movePath?.trim() ?? null,
      added: 0,
      removed: 0,
      kind,
    })
  }
  return stats
}

const shortenPath = (value: string) => {
  const normalized = value.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 2) {
    return value
  }
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
}

const buildFileChangeStats = (messages: Message[]): FileChangeStat[] => {
  const stats: FileChangeStat[] = []
  let diffFallback: string | null = null
  let contentFallback: string | null = null

  for (const message of messages) {
    const changes = message.meta?.fileChanges ?? []
    for (const change of changes) {
      const diff = change.diff ?? ''
      const { added, removed } = countDiffLines(diff, change.kind)
      stats.push({
        path: change.path,
        movePath: change.movePath ?? undefined,
        added,
        removed,
        kind: change.kind,
      })
    }
    if (!changes.length && message.meta?.diff) {
      diffFallback = message.meta.diff
    }
    if (!changes.length && message.content && !contentFallback) {
      contentFallback = message.content
    }
  }

  if (!stats.length && diffFallback) {
    return parseUnifiedDiffStats(diffFallback)
  }
  if (!stats.length && contentFallback) {
    return parseFileChangesFromContent(contentFallback)
  }
  return stats
}

const summarizeFileChanges = (stats: FileChangeStat[]) => {
  if (!stats.length) {
    return { summary: '', rows: [] as ActionRowItem[], verb: 'Edited' }
  }

  const totalAdded = stats.reduce((sum, entry) => sum + entry.added, 0)
  const totalRemoved = stats.reduce((sum, entry) => sum + entry.removed, 0)
  const hasCounts = totalAdded > 0 || totalRemoved > 0

  const formatCounts = (added: number, removed: number) =>
    hasCounts ? `(+${added} -${removed})` : ''
  const isSingle = stats.length === 1
  const verb = isSingle
    ? stats[0].kind === 'add'
      ? 'Added'
      : stats[0].kind === 'delete'
        ? 'Deleted'
        : 'Edited'
    : 'Edited'

  const summary = isSingle
    ? [
        `${shortenPath(stats[0].path)}${stats[0].movePath ? ` \u2192 ${shortenPath(stats[0].movePath)}` : ''}`.trim(),
        formatCounts(stats[0].added, stats[0].removed),
      ]
        .filter(Boolean)
        .join(' ')
    : [
        `${stats.length} files`.trim(),
        formatCounts(totalAdded, totalRemoved),
      ]
        .filter(Boolean)
        .join(' ')

  const rows = stats.map((entry) => ({
    label: entry.kind === 'add' ? 'Added' : entry.kind === 'delete' ? 'Deleted' : 'Edited',
    detail: [
      `${entry.path}${entry.movePath ? ` \u2192 ${entry.movePath}` : ''}`.trim(),
      formatCounts(entry.added, entry.removed),
    ]
      .filter(Boolean)
      .join(' '),
  }))

  return { summary, rows, verb }
}

function getActionType(msg: Message): AssistantAction['type'] {
  if (msg.kind === 'reasoning') return 'reasoning'
  if (msg.kind === 'file') {
    if (msg.meta?.fileChanges?.length || msg.meta?.diff) {
      return 'edited'
    }
    const title = msg.title?.toLowerCase() ?? ''
    if (title.includes('diff')) return 'edited'
    return 'edited'
  }
  if (msg.kind === 'command') return 'ran'
  if (msg.kind === 'tool') {
    if (msg.meta?.commandActions?.length) {
      const actions = msg.meta.commandActions
      const exploratory = actions.every((action) =>
        ['read', 'search', 'listFiles'].includes(action.type)
      )
      return exploratory ? 'explored' : 'ran'
    }
    const title = msg.title?.toLowerCase() ?? ''
    if (title.includes('web search')) return 'searched'
    if (title.includes('read') || title.includes('view') || title.includes('list')) return 'explored'
    if (title.includes('edit') || title.includes('wrote') || title.includes('creat')) return 'edited'
    if (title.includes('ran') || title.includes('exec') || title.includes('command')) return 'ran'
    return 'explored'
  }
  return 'chat'
}

function getActionLabel(type: AssistantAction['type'], messages: Message[]): { label: string; summary?: string } {
  const count = messages.length
  
  switch (type) {
    case 'reasoning': {
      const lines = messages.reduce((acc, m) => acc + m.content.split('\n').length, 0)
      return { label: 'Reasoning', summary: `${lines} lines` }
    }
    case 'explored': {
      const files = messages.map(m => {
        const title = m.title ?? ''
        const match = title.match(/(?:read|view|search|list)[:\s]+(.+)/i)
        if (match) return match[1].trim()
        const firstLine = m.content.split('\n')[0]
        if (firstLine.length < 60) return firstLine
        return title || 'file'
      })
      
      if (count === 1) {
        return { label: 'Read', summary: files[0] }
      }
      if (files.length <= 3) {
        return { label: 'Read', summary: files.join(', ') }
      }
      return { label: 'Read', summary: `${count} files` }
    }
    case 'edited': {
      const files = messages.map(m => {
        const title = m.title ?? ''
        const match = title.match(/(?:edit|wrote|creat)[:\s]+(.+)/i)
        if (match) return match[1].trim()
        return title || 'file'
      })
      
      if (count === 1) {
        return { label: 'Edited', summary: files[0] }
      }
      return { label: 'Edited', summary: `${count} files` }
    }
    case 'ran': {
      if (count === 1) {
        const cmd = messages[0].title ?? messages[0].content.split('\n')[0]
        const shortCmd = cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd
        return { label: 'Ran', summary: shortCmd }
      }
      return { label: 'Ran', summary: `${count} commands` }
    }
    case 'searched': {
      if (count === 1) {
        const query = messages[0].content.trim()
        const shortQuery = query.length > 50 ? query.slice(0, 50) + '...' : query
        return { label: 'Searched', summary: shortQuery }
      }
      return { label: 'Searched', summary: `${count} queries` }
    }
    default:
      return { label: 'Response' }
  }
}

const extractReasoningHeadline = (content: string) => {
  const match = content.match(/(?:^|\n)\s*\*\*(.+?)\*\*/u)
  if (match?.[1]) {
    return match[1].trim()
  }
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean)
  return firstLine || null
}

function groupMessagesIntoTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = []
  let currentTurn: Turn | null = null
  let pendingActions: Message[] = []
  let lastActionType: AssistantAction['type'] | null = null

  const flushPendingActions = () => {
    if (pendingActions.length > 0 && currentTurn && lastActionType) {
      const { label, summary } = getActionLabel(lastActionType, pendingActions)
      currentTurn.assistantActions.push({
        type: lastActionType,
        messages: [...pendingActions],
        label,
        summary,
      })
      pendingActions = []
      lastActionType = null
    }
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      flushPendingActions()
      
      currentTurn = {
        id: msg.id,
        userMessage: msg,
        assistantActions: [],
        timestamp: msg.timestamp,
      }
      turns.push(currentTurn)
    } else {
      if (!currentTurn) {
        currentTurn = {
          id: msg.id,
          assistantActions: [],
          timestamp: msg.timestamp,
        }
        turns.push(currentTurn)
      }

      const actionType = getActionType(msg)
      
      if (actionType === 'chat') {
        flushPendingActions()
        const { label, summary } = getActionLabel(actionType, [msg])
        currentTurn.assistantActions.push({
          type: actionType,
          messages: [msg],
          label,
          summary,
        })
      }
      else if (actionType === 'reasoning') {
        if (lastActionType === 'reasoning') {
          pendingActions.push(msg)
        } else {
          flushPendingActions()
          pendingActions = [msg]
          lastActionType = 'reasoning'
        }
      }
      else if (actionType === 'explored') {
        if (lastActionType === 'explored') {
          pendingActions.push(msg)
        } else {
          flushPendingActions()
          pendingActions = [msg]
          lastActionType = 'explored'
        }
      }
      else if (actionType === 'edited') {
        if (lastActionType === 'edited') {
          pendingActions.push(msg)
        } else {
          flushPendingActions()
          pendingActions = [msg]
          lastActionType = 'edited'
        }
      }
      else if (actionType === 'ran') {
        if (lastActionType === 'ran') {
          pendingActions.push(msg)
        } else {
          flushPendingActions()
          pendingActions = [msg]
          lastActionType = 'ran'
        }
      }
      // Web search actions are grouped
      else if (actionType === 'searched') {
        if (lastActionType === 'searched') {
          pendingActions.push(msg)
        } else {
          flushPendingActions()
          pendingActions = [msg]
          lastActionType = 'searched'
        }
      }
    }
  }

  flushPendingActions()

  return turns
}

export function VirtualizedMessageList({ 
  messages, 
  approvals,
  queuedMessages,
  threadStatus,
  turnStartedAt,
  lastTurnDuration,
  onApprove,
  onApproveForSession,
  onDeny,
  onInterrupt
}: VirtualizedMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const [listHeight, setListHeight] = useState(0)
  const lastScrollTop = useRef(0)
  const isAutoScrolling = useRef(false)
  const prevItemsLength = useRef(0)
  const lastMessage = messages[messages.length - 1]
  const userInteractedRef = useRef(false)
  const seenItemIds = useRef(new Set<string>())
  const lastMessageSignature = useMemo(() => {
    if (!lastMessage) {
      return ''
    }
    return `${lastMessage.id}:${lastMessage.content.length}`
  }, [lastMessage])

  const isWaitingForResponse = threadStatus === 'active' && lastMessage?.role === 'user'
  const isTaskRunning = threadStatus === 'active'
  
  const turns = useMemo(() => groupMessagesIntoTurns(messages), [messages])
  const workingBarHeight = 64
  const baseBuffer = listHeight ? Math.round(listHeight * 0.3) : 0
  const extraBuffer = Math.min(360, Math.max(120, baseBuffer))
  const bottomSpacerHeight = extraBuffer + (isTaskRunning ? workingBarHeight : 0)
  const activeReasoningHeadline = useMemo(() => {
    if (!isTaskRunning) {
      return null
    }
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i]
      if (message.kind !== 'reasoning' || !message.content.trim()) {
        continue
      }
      const headline = extractReasoningHeadline(message.content)
      if (headline) {
        return headline
      }
    }
    return null
  }, [isTaskRunning, messages])
  
  const items: Array<
    | { type: 'turn'; data: Turn } 
    | { type: 'approval'; data: ApprovalRequest }
    | { type: 'worked'; data: { duration: number } }
    | { type: 'queued'; data: QueuedMessage }
    | { type: 'spacer'; data: { height: number } }
  > = [
    ...turns.map(t => ({ type: 'turn' as const, data: t })),
    ...approvals.map(a => ({ type: 'approval' as const, data: a })),
    ...(!isTaskRunning && lastTurnDuration ? [{ type: 'worked' as const, data: { duration: lastTurnDuration } }] : []),
    ...queuedMessages.map(q => ({ type: 'queued' as const, data: q })),
    ...(bottomSpacerHeight > 0 ? [{ type: 'spacer' as const, data: { height: bottomSpacerHeight } }] : []),
  ]

  const initialScrollDone = useRef(false)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = items[index]
      if (item.type === 'approval') return 140
      if (item.type === 'worked') return 40
      if (item.type === 'queued') return 80
      if (item.type === 'spacer') return item.data.height
      const turn = item.data as Turn
      const userHeight = turn.userMessage ? 80 : 0
      const actionsHeight = turn.assistantActions.reduce((acc, action) => {
        if (action.type === 'chat') {
          const contentLength = action.messages[0]?.content.length ?? 0
          return acc + Math.max(60, Math.min(300, 40 + contentLength * 0.2))
        }
        return acc + 44
      }, 0)
      return userHeight + actionsHeight + 16
    },
    overscan: 3,
  })

  const handleScroll = useCallback(() => {
    if (!parentRef.current || isAutoScrolling.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    
    if (!userInteractedRef.current) {
      if (isAtBottom) {
        setUserHasScrolled(false)
      }
      lastScrollTop.current = scrollTop
      return
    }

    if (!isAtBottom) {
      setUserHasScrolled(true)
    } else {
      setUserHasScrolled(false)
      userInteractedRef.current = false
    }
    
    lastScrollTop.current = scrollTop
  }, [])

  useEffect(() => {
    if (items.length > 0 && !initialScrollDone.current) {
      initialScrollDone.current = true
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(items.length - 1, { align: 'end' })
      })
    }
  }, [items.length, virtualizer])

  useEffect(() => {
    const element = parentRef.current
    if (!element) {
      return
    }
    const updateHeight = () => {
      setListHeight(element.clientHeight)
    }
    updateHeight()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => updateHeight())
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const hasNewItems = items.length > prevItemsLength.current
    prevItemsLength.current = items.length

    if (items.length > 0 && hasNewItems && !userHasScrolled && initialScrollDone.current) {
      isAutoScrolling.current = true
      virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior: 'smooth' })
      setTimeout(() => {
        isAutoScrolling.current = false
      }, 500)
    }
  }, [items.length, virtualizer, userHasScrolled])

  useEffect(() => {
    if (!isTaskRunning || userHasScrolled || !initialScrollDone.current || items.length === 0) {
      return
    }
    isAutoScrolling.current = true
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(items.length - 1, { align: 'end' })
      setTimeout(() => {
        isAutoScrolling.current = false
      }, 200)
    })
  }, [isTaskRunning, userHasScrolled, lastMessageSignature, items.length, virtualizer])

  const scrollToBottom = useCallback(() => {
    if (items.length > 0) {
      setUserHasScrolled(false)
      isAutoScrolling.current = true
      virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior: 'smooth' })
      setTimeout(() => {
        isAutoScrolling.current = false
      }, 500)
    }
  }, [items.length, virtualizer])

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-text-muted">No messages yet. Start the conversation!</p>
      </div>
    )
  }

  return (
    <div className="flex-1 relative">
      <div 
        ref={parentRef} 
        className="h-full overflow-y-auto px-3 md:px-6 touch-scroll pb-4"
        style={{ contain: 'strict' }}
        onScroll={handleScroll}
        onWheel={() => {
          userInteractedRef.current = true
        }}
        onTouchMove={() => {
          userInteractedRef.current = true
        }}
        onMouseDown={() => {
          userInteractedRef.current = true
        }}
      >
        <div
          className="max-w-4xl mx-auto relative"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = items[virtualItem.index]
            const itemKey =
              item.type === 'turn'
                ? `turn:${item.data.id}`
                : item.type === 'approval'
                  ? `approval:${item.data.id}`
                  : item.type === 'queued'
                    ? `queued:${item.data.id}`
                    : item.type === 'worked'
                      ? `worked:${item.data.duration}`
                      : null
            const isFresh = itemKey ? !seenItemIds.current.has(itemKey) : false
            if (itemKey) {
              seenItemIds.current.add(itemKey)
            }
            const shouldAnimate = isFresh && !userHasScrolled && initialScrollDone.current && item.type !== 'spacer'
            const wrapperClass = item.type === 'spacer'
              ? 'absolute top-0 left-0 w-full'
              : `absolute top-0 left-0 w-full py-2${shouldAnimate ? ' animate-in fade-in duration-200' : ''}`
            
            return (
              <div
                key={virtualItem.key}
                className={wrapperClass}
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
              >
                {item.type === 'turn' ? (
                  <TurnView turn={item.data} />
                ) : item.type === 'worked' ? (
                  <WorkedBubble duration={item.data.duration} />
                ) : item.type === 'queued' ? (
                  <QueuedMessageBubble message={item.data} />
                ) : item.type === 'spacer' ? (
                  <div style={{ height: item.data.height }} />
                ) : (
                  <ApprovalCard 
                    approval={item.data as ApprovalRequest}
                    onApprove={() => onApprove(item.data as ApprovalRequest)}
                    onApproveForSession={onApproveForSession ? () => onApproveForSession(item.data as ApprovalRequest) : undefined}
                    onDeny={() => onDeny(item.data as ApprovalRequest)}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {isTaskRunning && (
        <StickyWorkingBar
          message={activeReasoningHeadline ?? (isWaitingForResponse ? 'Thinking' : 'Working')}
          startedAt={turnStartedAt ?? null}
          onInterrupt={onInterrupt}
        />
      )}

      {userHasScrolled && (
        <button
          onClick={scrollToBottom}
          className={`absolute ${isTaskRunning ? 'bottom-20' : 'bottom-4'} left-1/2 -translate-x-1/2 
                     flex items-center gap-1.5 px-3 py-1.5 bg-bg-elevated border border-border rounded-full
                     text-xs text-text-muted hover:text-text-primary hover:border-text-muted transition-all
                     shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200`}
        >
          <Icons.ChevronDown className="w-3 h-3" />
          <span>New messages</span>
        </button>
      )}
    </div>
  )
}

function StickyWorkingBar({
  message,
  startedAt,
  onInterrupt,
}: {
  message: string
  startedAt: number | null
  onInterrupt?: () => void
}) {
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
  )

  useEffect(() => {
    if (!startedAt) {
      return
    }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  const formatElapsed = (secs: number) => {
    if (secs < 60) return `${secs}s`
    const mins = Math.floor(secs / 60)
    const remaining = secs % 60
    return `${mins}m ${remaining.toString().padStart(2, '0')}s`
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 px-3 md:px-6 pb-3">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 bg-bg-elevated/90 border border-border rounded-full px-4 py-2 shadow-lg backdrop-blur">
          <ShimmerText text={message} className="text-xs text-text-primary font-medium" />
          {startedAt !== null && (
            <span className="text-[10px] text-text-muted">({formatElapsed(elapsed)})</span>
          )}
          {onInterrupt && (
            <button
              onClick={onInterrupt}
              className="ml-auto px-2 py-0.5 text-[10px] text-text-muted hover:text-error hover:bg-error/10 rounded transition-colors"
            >
              Stop
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkedBubble({ duration }: { duration: number }) {
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`
  }
  
  return (
    <div className="pl-10">
      <div className="flex items-center gap-2 py-1">
        <span className="text-success">✓</span>
        <span className="text-xs text-text-muted">Worked for {formatDuration(duration)}</span>
      </div>
    </div>
  )
}

function QueuedMessageBubble({ message }: { message: QueuedMessage }) {
  return (
    <div className="flex gap-3 justify-end opacity-50">
      <div className="max-w-[75%] min-w-0">
        <div className="bg-bg-elevated/50 rounded-2xl rounded-br-md px-4 py-3 border border-dashed border-border">
          <p className="text-sm text-text-muted whitespace-pre-wrap leading-relaxed break-words">
            {message.text}
          </p>
        </div>
        <span className="text-[10px] text-text-muted/60 mt-1 px-1 block text-right">Queued</span>
      </div>
      <div className="shrink-0 mt-0.5 opacity-50">
        <Avatar name="You" size="sm" />
      </div>
    </div>
  )
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <div className="space-y-2">
      {turn.userMessage && (
        <UserMessage message={turn.userMessage} />
      )}
      
      {turn.assistantActions.length > 0 && (
        <div className="pl-10 space-y-1">
          {turn.assistantActions.map((action, i) => (
            <ActionRow key={i} action={action} />
          ))}
        </div>
      )}
    </div>
  )
}

function UserMessage({ message }: { message: Message }) {
  const lineCount = message.content.split('\n').length
  const charCount = message.content.length
  const isSuperLong = charCount > 3000 || lineCount > 50
  const [isExpanded, setIsExpanded] = useState(false)
  
  if (isSuperLong) {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[75%] min-w-0">
          <div className="bg-bg-elevated rounded-2xl rounded-br-md overflow-hidden">
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-bg-hover/50 transition-colors"
            >
              <Icons.ChevronDown 
                className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 
                           ${isExpanded ? 'rotate-180' : '-rotate-90'}`} 
              />
              <span className="text-xs text-text-muted">Long message</span>
              <span className="text-[10px] text-text-muted/60 ml-auto">
                {lineCount} lines • {charCount > 10000 ? `${Math.round(charCount/1000)}k` : charCount} chars
              </span>
            </button>
            {isExpanded && (
              <div className="px-4 pb-3 max-h-[50vh] overflow-y-auto border-t border-border/50">
                <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed break-words font-mono text-xs pt-2">
                  {message.content}
                </p>
              </div>
            )}
            {!isExpanded && (
              <div className="px-4 pb-3">
                <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed break-words line-clamp-3">
                  {message.content.slice(0, 200)}...
                </p>
              </div>
            )}
          </div>
          <span className="text-[10px] text-text-muted mt-1 px-1 block text-right">{message.timestamp}</span>
        </div>
        <div className="shrink-0 mt-0.5">
          <Avatar name="You" size="sm" />
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex gap-3 justify-end">
      <div className="max-w-[75%] min-w-0">
        <div className="bg-bg-elevated rounded-2xl rounded-br-md px-4 py-3">
          <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed break-words">
            {message.content}
          </p>
        </div>
        <span className="text-[10px] text-text-muted mt-1 px-1 block text-right">{message.timestamp}</span>
      </div>
      <div className="shrink-0 mt-0.5">
        <Avatar name="You" size="sm" />
      </div>
    </div>
  )
}

function ActionRow({ action }: { action: AssistantAction }) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  if (action.type === 'chat') {
    const content = action.messages.map(m => m.content).join('\n\n')
    const isLong = content.length > 1500
    
    return (
      <div className="py-2">
        {isLong ? (
          <CollapsibleContent maxHeight={300}>
            <Markdown 
              content={content} 
              className="text-sm text-text-primary leading-relaxed"
            />
          </CollapsibleContent>
        ) : (
          <Markdown 
            content={content} 
            className="text-sm text-text-primary leading-relaxed"
          />
        )}
      </div>
    )
  }
  
  if (action.type === 'reasoning') {
    const content = action.messages.map(m => m.content).join('\n\n')
    const trimmed = content.trim().toLowerCase()
    const isPlaceholder = !trimmed || trimmed === 'reasoning' || trimmed === 'reasoning summary' || trimmed === 'thinking'
    
    if (isPlaceholder) {
      return (
        <div className="flex items-center gap-2 py-1.5 pl-2">
          <ThinkingIndicator message="Thinking" />
        </div>
      )
    }
    
    return (
      <div>
        <div className="flex items-center gap-2 py-1.5 px-2 -mx-2">
          <span className="text-xs text-text-muted font-medium">{action.label}</span>
          {action.summary && (
            <span className="text-[10px] text-text-muted/60 ml-1">{action.summary}</span>
          )}
        </div>
        <div className="pl-6 pb-2 pt-1">
          <Markdown 
            content={content} 
            className="text-xs text-text-secondary leading-relaxed"
          />
        </div>
      </div>
    )
  }

  const content = action.messages.map(m => m.content).join('\n---\n')
  const hasContent = content.trim().length > 0
  const isActive = action.messages.some((message) => isInProgressStatus(message.meta?.status))

  const commandRows =
    action.type === 'explored' || action.type === 'ran'
      ? buildCommandActionRows(action.messages)
      : []
  const fileStats = action.type === 'edited' ? buildFileChangeStats(action.messages) : []
  const fileSummary = action.type === 'edited' ? summarizeFileChanges(fileStats) : null

  const label =
    action.type === 'explored'
      ? isActive ? 'Exploring' : 'Explored'
      : action.type === 'ran'
        ? isActive ? 'Running' : 'Ran'
        : action.type === 'edited'
          ? isActive ? 'Editing' : (fileSummary?.verb ?? 'Edited')
          : action.label

  const summaryCandidate =
    action.type === 'edited'
      ? fileSummary?.summary
      : action.type === 'ran'
        ? action.messages.find((message) => message.meta?.command)?.meta?.command ||
          commandRows.find((row) => row.label === 'Run')?.detail ||
          action.summary
        : undefined

  const summary = summaryCandidate && !isStatusText(summaryCandidate) ? summaryCandidate : undefined

  const detailRows =
    action.type === 'explored'
      ? commandRows
      : action.type === 'edited'
        ? fileSummary?.rows ?? []
        : []

  const maxRows = 4
  const canExpand = hasContent || detailRows.length > maxRows
  const visibleRows = isExpanded ? detailRows : detailRows.slice(0, maxRows)
  const hiddenCount = detailRows.length - visibleRows.length

  const getIcon = () => {
    switch (action.type) {
      case 'explored': return <Icons.Search className="w-3 h-3 text-text-muted/60" />
      case 'edited': return <Icons.File className="w-3 h-3 text-accent-green/60" />
      case 'ran': return <Icons.Terminal className="w-3 h-3 text-text-muted/60" />
      case 'searched': return <Icons.Globe className="w-3 h-3 text-accent-green/60" />
      default: return null
    }
  }

  return (
    <div>
      <button
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 py-1.5 rounded px-2 -mx-2 transition-colors w-full text-left
                   ${canExpand ? 'hover:bg-bg-hover/30 cursor-pointer' : 'cursor-default'}`}
      >
        {getIcon()}
        {isActive ? (
          <ShimmerText text={label} className="text-xs text-text-primary font-medium" />
        ) : (
          <span className="text-xs text-text-primary font-medium">{label}</span>
        )}
        {summary && (
          <span className="text-xs text-text-muted ml-1 truncate max-w-[320px]">{summary}</span>
        )}
        {canExpand && (
          <Icons.ChevronDown
            className={`w-3 h-3 text-text-muted ml-auto transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
          />
        )}
      </button>
      {detailRows.length > 0 && (
        <div className="pl-6 pb-1 pt-0.5 space-y-0.5">
          {visibleRows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="text-xs text-text-secondary">
              <span className="text-text-muted">{row.label}</span>
              <span className="text-text-muted/60"> · </span>
              <span>{row.detail}</span>
            </div>
          ))}
          {!isExpanded && hiddenCount > 0 && (
            <div className="text-[10px] text-text-muted">+{hiddenCount} more</div>
          )}
        </div>
      )}
      {isExpanded && hasContent && (
        <div className="pl-6 pb-2 pt-1">
          <pre className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed font-mono bg-bg-primary/50 rounded p-2 max-h-[300px] overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  )
}

function ApprovalCard({ 
  approval, 
  onApprove,
  onApproveForSession,
  onDeny 
}: { 
  approval: ApprovalRequest
  onApprove: () => void
  onApproveForSession?: () => void
  onDeny: () => void 
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  
  const typeLabels = {
    command: 'Run command',
    file: 'Edit file',
    network: 'Network request',
  }

  const getIcon = () => {
    switch (approval.type) {
      case 'command': return <Icons.Terminal className="w-3 h-3 text-yellow-500/70" />
      case 'file': return <Icons.File className="w-3 h-3 text-yellow-500/70" />
      case 'network': return <Icons.Globe className="w-3 h-3 text-yellow-500/70" />
      default: return <Icons.Warning className="w-3 h-3 text-yellow-500/70" />
    }
  }

  return (
    <div className="pl-10">
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 py-1.5 hover:bg-bg-hover/30 rounded px-2 -mx-2 transition-colors w-full text-left"
        >
          {getIcon()}
          <span className="text-xs text-yellow-500 font-medium">Approval needed</span>
          <span className="text-xs text-text-muted ml-1">{typeLabels[approval.type]}</span>
        </button>
        {isExpanded && (
          <div className="pl-6 pb-2 pt-1 space-y-2">
            <pre className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed font-mono bg-bg-primary/50 rounded p-2 max-h-[200px] overflow-y-auto">
              {approval.payload}
            </pre>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={onApprove}>
                <Icons.Check className="w-3 h-3" />
                Approve
              </Button>
              {onApproveForSession && (
                <Button variant="ghost" size="sm" onClick={onApproveForSession}>
                  <Icons.Bolt className="w-3 h-3" />
                  Always
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={onDeny}>
                <Icons.X className="w-3 h-3" />
                Deny
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
