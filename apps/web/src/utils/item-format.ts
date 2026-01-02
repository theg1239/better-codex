import type { Message, MessageKind } from '../types'

type ThreadItem = {
  type: string
  id: string
  [key: string]: unknown
}

type CommandAction =
  | { type: 'read'; command: string; name: string; path: string }
  | { type: 'listFiles'; command: string; path?: string | null }
  | { type: 'search'; command: string; query?: string | null; path?: string | null }
  | { type: 'unknown'; command: string }

const clampText = (value: string, max = 1400) => {
  if (value.length <= max) {
    return value
  }
  return `${value.slice(0, max)}\n…`
}

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const formatFileChanges = (changes: Array<{ path?: unknown; kind?: unknown; diff?: string; movePath?: unknown }>) => {
  const summary = changes
    .map((change) => {
      const path =
        typeof change.path === 'string'
          ? change.path
          : change.path
            ? safeStringify(change.path)
            : 'unknown'
      const kind = typeof change.kind === 'string' ? change.kind : 'update'
      const movePath =
        typeof change.movePath === 'string'
          ? ` -> ${change.movePath}`
          : change.movePath
            ? ` -> ${safeStringify(change.movePath)}`
            : ''
      return `${kind}: ${path}${movePath}`
    })
    .join('\n')

  const diffPreview = changes
    .map((change) => change.diff ?? '')
    .filter(Boolean)
    .join('\n\n')

  const content = [summary, diffPreview].filter(Boolean).join('\n\n')
  return clampText(content)
}

const formatCommandActions = (actions: CommandAction[], commandFallback: string) => {
  if (!actions.length) {
    return {
      kind: 'command' as MessageKind,
      title: 'Command',
      content: commandFallback,
    }
  }

  const primary = actions.find((action) => action.type !== 'unknown') ?? actions[0]
  switch (primary.type) {
    case 'read': {
      const detail = primary.path ? `${primary.name} · ${primary.path}` : primary.name
      return {
        kind: 'tool' as MessageKind,
        title: 'Read',
        content: detail || commandFallback,
      }
    }
    case 'search': {
      const detail = [primary.query, primary.path].filter(Boolean).join(' · ')
      return {
        kind: 'tool' as MessageKind,
        title: 'Search',
        content: detail || commandFallback,
      }
    }
    case 'listFiles': {
      return {
        kind: 'tool' as MessageKind,
        title: 'List',
        content: primary.path || commandFallback,
      }
    }
    default:
      return {
        kind: 'command' as MessageKind,
        title: 'Command',
        content: commandFallback,
      }
  }
}

export const formatThreadItem = (item: ThreadItem): { kind: MessageKind; content: string; title?: string } | null => {
  switch (item.type) {
    case 'reasoning': {
      const summary = Array.isArray(item.summary) ? item.summary.join('\n') : ''
      const content = summary
      return { kind: 'reasoning', content: clampText(content), title: 'Reasoning' }
    }
    case 'commandExecution': {
      const command = typeof item.command === 'string' ? item.command : 'Command'
      const output = typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : ''
      const status = typeof item.status === 'string' ? item.status : 'inProgress'
      const actions = Array.isArray(item.commandActions) ? (item.commandActions as CommandAction[]) : []
      const actionSummary = formatCommandActions(actions, command)
      const content = output ? `${actionSummary.content}\n\n${output}` : actionSummary.content
      return { kind: actionSummary.kind, content: clampText(content), title: `${actionSummary.title} · ${status}` }
    }
    case 'fileChange': {
      const changes = Array.isArray(item.changes) ? item.changes : []
      const content = formatFileChanges(changes as Array<{ path?: string; kind?: string; diff?: string; movePath?: string }>)
      const status = typeof item.status === 'string' ? item.status : 'inProgress'
      return { kind: 'file', content, title: `Files · ${status}` }
    }
    case 'mcpToolCall': {
      const server = typeof item.server === 'string' ? item.server : 'mcp'
      const tool = typeof item.tool === 'string' ? item.tool : 'tool'
      const args = item.arguments ? safeStringify(item.arguments) : ''
      const result = item.result ? safeStringify(item.result) : ''
      const error = item.error ? safeStringify(item.error) : ''
      const content = [args, result, error].filter(Boolean).join('\n\n')
      return { kind: 'tool', content: clampText(content || `${server}.${tool}`), title: `${server}.${tool}` }
    }
    case 'webSearch': {
      const query = typeof item.query === 'string' ? item.query : 'Search'
      return { kind: 'tool', content: clampText(query), title: 'Web Search' }
    }
    case 'imageView': {
      const path = typeof item.path === 'string' ? item.path : 'Image'
      return { kind: 'tool', content: clampText(path), title: 'Image View' }
    }
    case 'enteredReviewMode': {
      const review = typeof item.review === 'string' ? item.review : 'Review'
      return { kind: 'tool', content: clampText(review), title: 'Review Started' }
    }
    case 'exitedReviewMode': {
      const review = typeof item.review === 'string' ? item.review : 'Review'
      return { kind: 'tool', content: clampText(review, 2400), title: 'Review' }
    }
    case 'compacted': {
      return { kind: 'tool', content: 'Conversation compacted to save context.', title: 'Compaction' }
    }
    default:
      return null
  }
}

export const buildSystemMessage = (item: ThreadItem): Message | null => {
  const formatted = formatThreadItem(item)
  if (!formatted) {
    return null
  }
  return {
    id: item.id,
    role: 'assistant',
    kind: formatted.kind,
    title: formatted.title,
    content: formatted.content,
    timestamp: '',
  }
}
