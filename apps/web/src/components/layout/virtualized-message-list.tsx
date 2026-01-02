import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Message, ApprovalRequest, ThreadStatus, QueuedMessage } from '../../types'
import { Avatar, Button, Icons, CollapsibleContent, ThinkingIndicator } from '../ui'
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

function getActionType(msg: Message): AssistantAction['type'] {
  if (msg.kind === 'reasoning') return 'reasoning'
  if (msg.kind === 'file') {
    const title = msg.title?.toLowerCase() ?? ''
    if (title.includes('edit') || title.includes('wrote') || title.includes('creat')) return 'edited'
    return 'explored'
  }
  if (msg.kind === 'command') return 'ran'
  if (msg.kind === 'tool') {
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
  const lastScrollTop = useRef(0)
  const isAutoScrolling = useRef(false)
  const prevItemsLength = useRef(0)

  const lastMessage = messages[messages.length - 1]
  const isWaitingForResponse = threadStatus === 'active' && lastMessage?.role === 'user'
  const isTaskRunning = threadStatus === 'active'
  
  const turns = useMemo(() => groupMessagesIntoTurns(messages), [messages])
  
  const items: Array<
    | { type: 'turn'; data: Turn } 
    | { type: 'approval'; data: ApprovalRequest }
    | { type: 'thinking'; data: null }
    | { type: 'working'; data: { startedAt: number } }
    | { type: 'worked'; data: { duration: number } }
    | { type: 'queued'; data: QueuedMessage }
  > = [
    ...turns.map(t => ({ type: 'turn' as const, data: t })),
    ...approvals.map(a => ({ type: 'approval' as const, data: a })),
    ...(isWaitingForResponse ? [{ type: 'thinking' as const, data: null }] : []),
    ...(isTaskRunning && !isWaitingForResponse && turnStartedAt ? [{ type: 'working' as const, data: { startedAt: turnStartedAt } }] : []),
    ...(!isTaskRunning && lastTurnDuration ? [{ type: 'worked' as const, data: { duration: lastTurnDuration } }] : []),
    ...queuedMessages.map(q => ({ type: 'queued' as const, data: q })),
  ]

  const initialScrollDone = useRef(false)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = items[index]
      if (item.type === 'approval') return 140
      if (item.type === 'thinking') return 60
      if (item.type === 'working') return 60
      if (item.type === 'worked') return 40
      if (item.type === 'queued') return 80
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
    
    if (scrollTop < lastScrollTop.current && !isAtBottom) {
      setUserHasScrolled(true)
    }
    
    if (isAtBottom) {
      setUserHasScrolled(false)
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
        className="h-full overflow-y-auto px-3 md:px-6 touch-scroll"
        style={{ contain: 'strict' }}
        onScroll={handleScroll}
      >
        <div
          className="max-w-4xl mx-auto relative"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = items[virtualItem.index]
            
            return (
              <div
                key={virtualItem.key}
                className="absolute top-0 left-0 w-full py-2"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
              >
                {item.type === 'turn' ? (
                  <TurnView turn={item.data} />
                ) : item.type === 'thinking' ? (
                  <ThinkingBubble onInterrupt={isTaskRunning ? onInterrupt : undefined} />
                ) : item.type === 'working' ? (
                  <WorkingBubble startedAt={item.data.startedAt} onInterrupt={isTaskRunning ? onInterrupt : undefined} />
                ) : item.type === 'worked' ? (
                  <WorkedBubble duration={item.data.duration} />
                ) : item.type === 'queued' ? (
                  <QueuedMessageBubble message={item.data} />
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

      {userHasScrolled && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 
                     bg-bg-elevated border border-border rounded-full text-xs text-text-muted 
                     hover:text-text-primary hover:border-text-muted transition-all shadow-lg
                     animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <Icons.ChevronDown className="w-3 h-3" />
          <span>New messages</span>
        </button>
      )}
    </div>
  )
}

function ThinkingBubble({ onInterrupt }: { onInterrupt?: () => void }) {
  return (
    <div className="pl-10">
      <div className="flex items-center gap-2 py-2">
        <span className="text-text-muted">•</span>
        <ThinkingIndicator message="Thinking" />
        {onInterrupt && (
          <button
            onClick={onInterrupt}
            className="ml-2 px-2 py-0.5 text-xs text-text-muted hover:text-error hover:bg-error/10 rounded transition-colors"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  )
}

function WorkingBubble({ startedAt, onInterrupt }: { startedAt: number; onInterrupt?: () => void }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000))
  
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])
  
  return (
    <div className="pl-10">
      <div className="flex items-center gap-2 py-2">
        <span className="text-text-muted">•</span>
        <ThinkingIndicator message="Working" elapsed={elapsed} />
        {onInterrupt && (
          <button
            onClick={onInterrupt}
            className="ml-2 px-2 py-0.5 text-xs text-text-muted hover:text-error hover:bg-error/10 rounded transition-colors"
          >
            Stop
          </button>
        )}
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
        <div className="flex items-center gap-2 py-1.5">
          <span className="text-text-muted">•</span>
          <ThinkingIndicator message="Thinking" />
        </div>
      )
    }
    
    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 py-1.5 hover:bg-bg-hover/30 rounded px-2 -mx-2 transition-colors w-full text-left"
        >
          <span className="text-text-muted/60">•</span>
          <Icons.ChevronDown 
            className={`w-3 h-3 text-text-muted transition-transform duration-200 
                       ${isExpanded ? '' : '-rotate-90'}`} 
          />
          <span className="text-xs text-text-muted font-medium">{action.label}</span>
          {action.summary && (
            <span className="text-[10px] text-text-muted/60 ml-1">{action.summary}</span>
          )}
        </button>
        {isExpanded && (
          <div className="pl-6 pb-2 pt-1">
            <Markdown 
              content={content} 
              className="text-xs text-text-secondary leading-relaxed"
            />
          </div>
        )}
      </div>
    )
  }
  
  const content = action.messages.map(m => m.content).join('\n---\n')
  const hasContent = content.trim().length > 0
  
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
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 py-1.5 rounded px-2 -mx-2 transition-colors w-full text-left
                   ${hasContent ? 'hover:bg-bg-hover/30 cursor-pointer' : 'cursor-default'}`}
      >
        {getIcon()}
        <span className="text-xs text-text-primary font-medium">{action.label}</span>
        {action.summary && (
          <span className="text-xs text-text-muted ml-1 truncate max-w-[300px]">{action.summary}</span>
        )}
      </button>
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
