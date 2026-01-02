import { useState, useMemo, useEffect, useRef } from 'react'
import { useAppStore } from '../../store'
import { hubClient } from '../../services/hub-client'
import { Icons, Button, Select, Input, Markdown } from '../ui'
import type { Message } from '../../types'
import { buildSystemMessage } from '../../utils/item-format'

const CWD_MAX_RESULTS = 8
type ThreadResumeResult = {
  thread?: {
    turns?: TurnData[]
  }
  model?: string | null
  cwd?: string | null
}

type TurnData = {
  id?: string
  items?: ThreadItem[]
}

type ThreadItem = {
  type: string
  id: string
  content?: UserInput[]
  text?: string
  review?: string
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
        return
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

const findReviewOutput = (turns: TurnData[] = []) => {
  for (const turn of turns) {
    for (const item of turn.items ?? []) {
      if (item.type === 'exitedReviewMode' && typeof item.review === 'string' && item.review.trim()) {
        return item.review
      }
    }
  }
  return ''
}

export function ReviewsView() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    modelsByAccount,
    reviewSessions,
    upsertReviewSession,
    updateReviewSession,
    setMessagesForThread,
    connectionStatus,
    messages,
  } = useAppStore()
  const [projectPath, setProjectPath] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [targetType, setTargetType] = useState<'uncommitted' | 'base' | 'commit' | 'custom'>('uncommitted')
  const [targetBranch, setTargetBranch] = useState('main')
  const [targetCommit, setTargetCommit] = useState('')
  const [targetCommitTitle, setTargetCommitTitle] = useState('')
  const [targetInstructions, setTargetInstructions] = useState('')
  const [cwdMatches, setCwdMatches] = useState<string[]>([])
  const [cwdMenuOpen, setCwdMenuOpen] = useState(false)
  const [cwdIndex, setCwdIndex] = useState(0)
  const [cwdRoot, setCwdRoot] = useState<string>('')

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)
  const availableModels = selectedAccountId ? (modelsByAccount[selectedAccountId] ?? []) : []
  const orderedSessions = useMemo(
    () => [...reviewSessions].sort((a, b) => b.startedAt - a.startedAt),
    [reviewSessions]
  )

  const modelOptions = useMemo(
    () =>
      availableModels.map((model) => ({
        value: model.id,
        label: model.displayName,
        description: model.description,
      })),
    [availableModels]
  )

  const accountOptions = useMemo(
    () =>
      accounts
        .filter((account) => account.status === 'online')
        .map((account) => ({
          value: account.id,
          label: account.name,
        })),
    [accounts]
  )

  const targetOptions = useMemo(
    () => [
      { value: 'uncommitted', label: 'Uncommitted changes' },
      { value: 'base', label: 'Base branch' },
      { value: 'commit', label: 'Commit' },
      { value: 'custom', label: 'Custom instructions' },
    ],
    []
  )

  const selectedReview = reviewSessions.find((session) => session.id === selectedReviewId)
  const reviewMessages = selectedReview?.threadId ? messages[selectedReview.threadId] ?? [] : []
  const hasReviewStream = reviewMessages.length > 0
  const resumeInFlight = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!selectedAccountId || connectionStatus !== 'connected' || cwdRoot) {
      return
    }

    let cancelled = false
    const loadRoot = async () => {
      try {
        const result = (await hubClient.request(selectedAccountId, 'command/exec', {
          command: ['pwd'],
          timeoutMs: 1500,
        })) as { stdout?: string }
        const root = (result.stdout ?? '').split('\n')[0]?.trim() ?? ''
        if (!cancelled && root) {
          setCwdRoot(root)
        }
      } catch {
        // keep empty; we'll fall back to relative paths
      }
    }

    loadRoot()

    return () => {
      cancelled = true
    }
  }, [selectedAccountId, connectionStatus, cwdRoot])

  useEffect(() => {
    if (!selectedReview?.threadId || connectionStatus !== 'connected') {
      return
    }

    const existing = messages[selectedReview.threadId]
    if (existing && existing.length) {
      return
    }

    if (resumeInFlight.current.has(selectedReview.threadId)) {
      return
    }

    let cancelled = false
    resumeInFlight.current.add(selectedReview.threadId)

    const loadHistory = async () => {
      try {
        const result = (await hubClient.request(selectedReview.profileId, 'thread/resume', {
          threadId: selectedReview.threadId,
        })) as ThreadResumeResult

        if (cancelled) {
          return
        }

        const resumeThread = result.thread
        if (!resumeThread?.turns) {
          return
        }

        const loadedMessages = buildMessagesFromTurns(resumeThread.turns)
        setMessagesForThread(selectedReview.threadId, loadedMessages)

        const reviewOutput = findReviewOutput(resumeThread.turns)
        if (reviewOutput) {
          updateReviewSession(selectedReview.id, {
            status: 'completed',
            review: reviewOutput,
            completedAt: Date.now(),
          })
        }
      } finally {
        resumeInFlight.current.delete(selectedReview.threadId)
      }
    }

    loadHistory().catch(() => {
      resumeInFlight.current.delete(selectedReview.threadId)
    })

    return () => {
      cancelled = true
    }
  }, [selectedReview, connectionStatus, messages, setMessagesForThread, updateReviewSession])

  useEffect(() => {
    if (connectionStatus !== 'connected') {
      return
    }

    let cancelled = false

    const loadReviews = async () => {
      try {
        const sessions = await hubClient.listReviews({ limit: 200 })
        if (cancelled) {
          return
        }
        sessions.forEach((session) => {
          upsertReviewSession({
            id: session.id,
            threadId: session.threadId,
            profileId: session.profileId,
            model: session.model ?? undefined,
            cwd: session.cwd ?? undefined,
            status: session.status,
            startedAt: session.startedAt,
            completedAt: session.completedAt ?? undefined,
            label: session.label ?? undefined,
            review: session.review ?? undefined,
          })
        })
      } catch (error) {
        console.warn('[Reviews] Failed to load review sessions', error)
      }
    }

    loadReviews()

    return () => {
      cancelled = true
    }
  }, [connectionStatus, upsertReviewSession])

  useEffect(() => {
    const query = projectPath.trim()
    if (!query || !selectedAccountId || connectionStatus !== 'connected') {
      setCwdMatches([])
      setCwdMenuOpen(false)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      const { baseDir, needle, isRooted } = splitPath(query, cwdRoot)
      const searchCwd = isRooted ? baseDir : null
      const maxDepth = needle ? '4' : '2'
      const command = needle
        ? ['find', '.', '-maxdepth', maxDepth, '-type', 'd', '-name', `*${needle}*`, '-not', '-path', '*/.git/*', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.codex/*', '-not', '-path', '*/.cache/*']
        : ['find', '.', '-maxdepth', maxDepth, '-type', 'd', '-not', '-name', '.', '-not', '-path', '*/.git/*', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.codex/*', '-not', '-path', '*/.cache/*']
      try {
        const result = (await hubClient.request(selectedAccountId, 'command/exec', {
          command,
          timeoutMs: 3000,
          cwd: searchCwd,
          sandboxPolicy: null,
        })) as { stdout?: string; exitCode?: number }

        if (cancelled) {
          return
        }

        const lines = (result.stdout ?? '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)

        const resolved = lines.map((line) => resolveCwdSuggestion(baseDir, line))
        setCwdMatches(resolved.slice(0, CWD_MAX_RESULTS))
        setCwdMenuOpen(resolved.length > 0)
        setCwdIndex(0)
      } catch {
        if (!cancelled) {
          setCwdMatches([])
          setCwdMenuOpen(false)
        }
      }
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [projectPath, selectedAccountId, connectionStatus, cwdRoot])

  const handleStartReview = async () => {
    if (!projectPath || !selectedModel || !selectedAccountId) {
      return
    }

    setIsStarting(true)
    try {
      const resolvedProjectPath = resolveProjectPath(projectPath, cwdRoot)
      const threadResult = (await hubClient.request(selectedAccountId, 'thread/start', {
        model: selectedModel,
        cwd: resolvedProjectPath,
      })) as { thread?: { id?: string } }
      const threadId = threadResult.thread?.id
      if (!threadId) {
        throw new Error('Failed to start review thread')
      }

      const { target, label } = buildReviewTarget({
        type: targetType,
        branch: targetBranch,
        commit: targetCommit,
        commitTitle: targetCommitTitle,
        instructions: targetInstructions,
      })

      const reviewResult = (await hubClient.request(selectedAccountId, 'review/start', {
        threadId,
        delivery: 'inline',
        target,
      })) as { turn?: { id?: string; status?: string } }

      const turnId = reviewResult.turn?.id ?? `review-${Date.now()}`
      upsertReviewSession({
        id: turnId,
        threadId,
        profileId: selectedAccountId,
        model: selectedModel,
        cwd: resolvedProjectPath,
        status: 'running',
        startedAt: Date.now(),
        label: label ? `${projectLabel(resolvedProjectPath)} · ${label}` : projectLabel(resolvedProjectPath),
      })
      setSelectedReviewId(turnId)
      setProjectPath('')
    } catch (error) {
      const fallbackId = `review-${Date.now()}`
      upsertReviewSession({
        id: fallbackId,
        threadId: '',
        profileId: selectedAccountId,
        model: selectedModel,
        cwd: resolveProjectPath(projectPath, cwdRoot),
        status: 'failed',
        startedAt: Date.now(),
      })
      setSelectedReviewId(fallbackId)
      console.error(error)
      updateReviewSession(fallbackId, { status: 'failed' })
    } finally {
      setIsStarting(false)
    }
  }

  const targetReady =
    targetType === 'uncommitted' ||
    (targetType === 'base' && targetBranch.trim()) ||
    (targetType === 'commit' && targetCommit.trim()) ||
    (targetType === 'custom' && targetInstructions.trim())

  const canStart =
    projectPath &&
    selectedModel &&
    selectedAccountId &&
    selectedAccount?.status === 'online' &&
    connectionStatus === 'connected' &&
    targetReady

  if (selectedReview) {
    return (
      <div className="flex-1 flex flex-col h-full bg-bg-primary overflow-hidden">
        <header className="shrink-0 px-5 py-3 border-b border-border flex items-center gap-3">
          <button
            onClick={() => setSelectedReviewId(null)}
            className="p-1.5 -ml-1.5 rounded-md hover:bg-bg-hover transition-colors"
          >
            <Icons.ChevronLeft className="w-4 h-4 text-text-muted" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-medium text-text-primary truncate">
              {selectedReview.label ?? 'Code Review'}
            </h1>
            <p className="text-[11px] text-text-muted truncate">
              {selectedReview.model ?? 'default model'} · {formatRelativeTime(new Date(selectedReview.startedAt))}
            </p>
          </div>
          {selectedReview.status === 'running' && (
            <span className="text-[11px] text-text-muted">Analyzing...</span>
          )}
        </header>

        <div className="flex-1 overflow-y-auto pb-10">
          {selectedReview.review ? (
            <div className="p-4">
              <Markdown content={selectedReview.review} className="text-xs" />
            </div>
          ) : hasReviewStream ? (
            <div className="p-4">
              {selectedReview.status === 'running' && (
                <div className="flex items-center gap-2 text-[11px] text-text-muted mb-3">
                  <Icons.Loader className="w-3.5 h-3.5 text-text-muted" />
                  Review running · live output
                </div>
              )}
              <ReviewStream messages={reviewMessages} />
            </div>
          ) : selectedReview.status === 'running' ? (
            <div className="flex flex-col items-center justify-center h-full px-6">
              <Icons.Loader className="w-5 h-5 text-text-muted mb-3" />
              <p className="text-sm text-text-secondary">
                Review started · {selectedReview.label ?? 'Scanning codebase'}
              </p>
              <p className="text-[11px] text-text-muted mt-2 text-center max-w-md">
                Review output appears when the analysis completes. Large repos can take a few minutes.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <p className="text-sm text-text-secondary">Waiting for review output...</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const hasReviews = orderedSessions.length > 0

  const renderForm = (centered: boolean) => (
    <div className="space-y-2.5">
      <div className="relative">
        <Input
          placeholder={centered ? 'Path or GitHub URL (https://github.com/org/repo)' : 'Path or GitHub URL'}
          value={projectPath}
          onChange={setProjectPath}
          onFocus={() => setCwdMenuOpen(cwdMatches.length > 0)}
          onBlur={() => window.setTimeout(() => setCwdMenuOpen(false), 150)}
          onKeyDown={(event) => handleCwdKeyDown(event, cwdMatches, cwdIndex, setCwdIndex, (value) => {
            setProjectPath(value)
            setCwdMenuOpen(false)
          })}
        />
        {cwdMenuOpen && cwdMatches.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-bg-elevated shadow-lg overflow-hidden">
            {cwdMatches.map((match, index) => (
              <button
                key={match}
                onMouseDown={() => {
                  setProjectPath(match)
                  setCwdMenuOpen(false)
                }}
                className={`w-full text-left px-3 py-1.5 text-[11px] font-mono transition-colors first:pt-2 last:pb-2 ${
                  index === cwdIndex ? 'bg-bg-hover text-text-primary' : 'text-text-secondary'
                }`}
              >
                {match}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 text-[11px] text-text-muted">
        <button
          type="button"
          onClick={() => setProjectPath('~/projects/my-app')}
          className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-bg-tertiary hover:bg-bg-hover transition-colors"
        >
          <Icons.Terminal className="w-3.5 h-3.5" />
          Local path
        </button>
        <button
          type="button"
          onClick={() => setProjectPath('https://github.com/org/repo')}
          className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-bg-tertiary hover:bg-bg-hover transition-colors"
        >
          <Icons.Globe className="w-3.5 h-3.5" />
          GitHub repo
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-stretch">
        <Select
          options={accountOptions}
          value={selectedAccountId ?? ''}
          onChange={(value) => setSelectedAccountId(value)}
          placeholder="Account"
          size="sm"
          className="flex-1 min-w-0"
        />
        <Select
          options={modelOptions}
          value={selectedModel}
          onChange={setSelectedModel}
          placeholder="Model"
          disabled={!availableModels.length}
          size="sm"
          className="flex-1 min-w-0"
        />
        <Select
          options={targetOptions}
          value={targetType}
          onChange={(value) => setTargetType(value as 'uncommitted' | 'base' | 'commit' | 'custom')}
          placeholder="Target"
          size="sm"
          className="flex-1 min-w-0"
        />
      </div>

      {targetType === 'base' && (
        <Input
          placeholder="Base branch (e.g. main)"
          value={targetBranch}
          onChange={setTargetBranch}
        />
      )}
      {targetType === 'commit' && (
        <div className="flex gap-2">
          <Input
            placeholder="Commit SHA"
            value={targetCommit}
            onChange={setTargetCommit}
            className="flex-1"
          />
          <Input
            placeholder="Title (optional)"
            value={targetCommitTitle}
            onChange={setTargetCommitTitle}
            className="flex-[1.5]"
          />
        </div>
      )}
      {targetType === 'custom' && (
        <textarea
          className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors resize-none"
          rows={3}
          placeholder="Describe what you want reviewed..."
          value={targetInstructions}
          onChange={(event) => setTargetInstructions(event.target.value)}
        />
      )}

      <Button variant="primary" fullWidth disabled={!canStart || isStarting} onClick={handleStartReview}>
        {isStarting ? 'Starting...' : centered ? 'Start Review' : 'Review'}
      </Button>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col h-full bg-bg-primary overflow-y-auto">
      {hasReviews ? (
        <div className="max-w-3xl mx-auto w-full px-5 py-8">
          <div className="mb-5">
            {renderForm(false)}
          </div>

          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-2">Recent</p>
            <div className="space-y-1">
              {orderedSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedReviewId(session.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-bg-hover transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      session.status === 'running'
                        ? 'bg-accent-blue animate-pulse'
                        : session.status === 'completed'
                          ? 'bg-accent-green'
                          : session.status === 'failed'
                            ? 'bg-accent-red'
                            : 'bg-text-muted'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-text-primary truncate">
                          {session.label ?? 'Code Review'}
                        </span>
                        <span className="text-[10px] text-text-muted shrink-0">
                          {formatRelativeTime(new Date(session.startedAt))}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted truncate mt-0.5">
                        {accounts.find((a) => a.id === session.profileId)?.name ?? 'Unknown'} · {session.model}
                      </p>
                    </div>
                    <Icons.ChevronRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-bg-tertiary mb-3">
                <Icons.Search className="w-5 h-5 text-text-secondary" />
              </div>
              <h1 className="text-lg font-medium text-text-primary">Code Review</h1>
              <p className="text-xs text-text-muted mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                Analyze your codebase for issues, improvements, and best practices
              </p>
            </div>

            {renderForm(true)}

            {accounts.length > 0 && !accountOptions.length && (
              <p className="text-[11px] text-text-muted text-center mt-4">Sign in to an account to start</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function buildReviewTarget(options: {
  type: 'uncommitted' | 'base' | 'commit' | 'custom'
  branch: string
  commit: string
  commitTitle: string
  instructions: string
}) {
  switch (options.type) {
    case 'base':
      return {
        target: { type: 'baseBranch', branch: options.branch.trim() || 'main' },
        label: `base ${options.branch.trim() || 'main'}`,
      }
    case 'commit':
      return {
        target: { type: 'commit', sha: options.commit.trim(), title: options.commitTitle.trim() || undefined },
        label: `commit ${options.commit.trim().slice(0, 8)}`,
      }
    case 'custom':
      return {
        target: { type: 'custom', instructions: options.instructions.trim() },
        label: 'custom instructions',
      }
    default:
      return { target: { type: 'uncommittedChanges' }, label: 'uncommitted changes' }
  }
}

function splitPath(input: string, root: string): { baseDir: string; needle: string; isRooted: boolean } {
  const normalized = input.trim()
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash === -1) {
    const baseDir = root ? normalizeJoin(root, '.') : '.'
    return { baseDir, needle: normalized, isRooted: Boolean(root) }
  }
  let baseDir = normalized.slice(0, lastSlash) || '/'
  const needle = normalized.slice(lastSlash + 1)
  const isRooted = baseDir.startsWith('/')
  if (!isRooted && root) {
    baseDir = normalizeJoin(root, baseDir)
  }
  return { baseDir, needle, isRooted: isRooted || Boolean(root) }
}

function resolveCwdSuggestion(baseDir: string, match: string): string {
  const cleaned = match.replace(/^\.\//, '')
  if (baseDir === '.' || baseDir === '') {
    return cleaned
  }
  if (baseDir === '/') {
    return `/${cleaned}`
  }
  return normalizeJoin(baseDir, cleaned)
}

function normalizeJoin(root: string, relative: string): string {
  const cleanedRoot = root.replace(/\/$/, '')
  const cleanedRelative = relative.replace(/^\.\/+/, '').replace(/^\/+/, '')
  if (!cleanedRelative || cleanedRelative === '.') {
    return cleanedRoot || '/'
  }
  return `${cleanedRoot}/${cleanedRelative}`
}

function resolveProjectPath(input: string, root: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    return trimmed
  }
  if (trimmed.startsWith('/')) {
    return trimmed
  }
  if (!root) {
    return trimmed
  }
  return normalizeJoin(root, trimmed)
}


function handleCwdKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  matches: string[],
  index: number,
  setIndex: (value: number) => void,
  onSelect: (value: string) => void
) {
  if (!matches.length) {
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    setIndex((index + 1) % matches.length)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    setIndex((index - 1 + matches.length) % matches.length)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    onSelect(matches[index])
  }
}

function projectLabel(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) {
    return 'Code Review'
  }
  const parts = trimmed.split('/')
  return parts[parts.length - 1] || trimmed
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ReviewStream({ messages }: { messages: Message[] }) {
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  return (
    <div className="space-y-3 overflow-y-auto max-h-[70vh] pr-1">
      {messages.map((message) => (
        <div key={message.id} className="rounded-lg border border-border bg-bg-tertiary px-3 py-2">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="text-[10px] uppercase tracking-wide text-text-muted">
              {formatReviewLabel(message)}
            </span>
            {message.timestamp && (
              <span className="text-[10px] text-text-muted">{message.timestamp}</span>
            )}
          </div>
          <Markdown content={message.content} className="text-[11px] text-text-secondary" streaming />
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

function formatReviewLabel(message: Message): string {
  if (message.role === 'user') {
    return 'You'
  }
  if (message.title) {
    return message.title
  }
  if (message.kind === 'tool') {
    return 'Tool'
  }
  if (message.kind === 'reasoning') {
    return 'Reasoning'
  }
  return 'Assistant'
}
