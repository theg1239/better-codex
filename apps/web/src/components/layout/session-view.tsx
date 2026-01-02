import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { type SelectOption } from '../ui'
import { VirtualizedMessageList } from './virtualized-message-list'
import { hubClient } from '../../services/hub-client'
import type { ApprovalPolicy, Attachment, FileMention, MessageKind, ReasoningEffort, ReasoningSummary } from '../../types'
import { INIT_PROMPT } from '../../utils/init-prompt'
import { filterSlashCommands, findSlashCommand, getSlashQuery, parseSlashInput, type SlashCommandDefinition } from '../../utils/slash-commands'
import { approvalPolicyDescription, approvalPolicyLabel, normalizeApprovalPolicy } from '../../utils/approval-policy'
import { normalizeReasoningSummary, reasoningSummaryDescription, reasoningSummaryLabel } from '../../utils/reasoning-summary'
import { refreshAccountSnapshot } from '../../utils/account-refresh'
import { expandPromptTemplate, stripPromptFrontmatter } from '../../utils/prompt-expander'
import { SessionHeader } from '../session-view/session-header'
import { SessionAuthBanner } from '../session-view/session-auth-banner'
import { SessionComposer } from '../session-view/session-composer'
import { SessionDialogs } from '../session-view/session-dialogs'
import { SessionEmpty } from '../session-view/session-empty'

export function SessionView() {
  const [inputValue, setInputValue] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [showModelDialog, setShowModelDialog] = useState(false)
  const [showApprovalsDialog, setShowApprovalsDialog] = useState(false)
  const [showSkillsDialog, setShowSkillsDialog] = useState(false)
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false)
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [skillsError, setSkillsError] = useState<string | null>(null)
  const [skillsList, setSkillsList] = useState<Array<{ name: string; description: string; path: string }>>([])
  const [promptCommands, setPromptCommands] = useState<SlashCommandDefinition[]>([])
  const [feedbackCategory, setFeedbackCategory] = useState('bug')
  const [feedbackReason, setFeedbackReason] = useState('')
  const [feedbackIncludeLogs, setFeedbackIncludeLogs] = useState(true)
  const [pendingModelId, setPendingModelId] = useState('')
  const [pendingEffort, setPendingEffort] = useState<ReasoningEffort | ''>('')
  const [pendingSummary, setPendingSummary] = useState<ReasoningSummary | ''>('')
  const [pendingCwd, setPendingCwd] = useState('')
  const [pendingApproval, setPendingApproval] = useState<ApprovalPolicy>('on-request')
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false)
  // Attachments and file mentions state
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [fileMentions, setFileMentions] = useState<FileMention[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [fileSearchResults, setFileSearchResults] = useState<FileMention[]>([])
  const [copyDialog, setCopyDialog] = useState<{ open: boolean; url: string }>({
    open: false,
    url: '',
  })
  const [alertDialog, setAlertDialog] = useState<{ open: boolean; title: string; message: string; variant: 'info' | 'warning' | 'error' }>({
    open: false,
    title: '',
    message: '',
    variant: 'info',
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const authPollRef = useRef<number | null>(null)
  const { 
    accounts,
    threads, 
    selectedThreadId, 
    selectedAccountId,
    accountLoginIds,
    messages,
    approvals,
    resolveApproval,
    addMessage,
    addThread,
    updateAccount,
    updateThread,
    activeTab,
    modelsByAccount,
    threadModels,
    threadEfforts,
    threadApprovals,
    threadWebSearch,
    threadTurnIds,
    threadTokenUsage,
    setThreadModel,
    setThreadEffort,
    setThreadApproval,
    setThreadWebSearch,
    threadSummaries,
    setThreadSummary,
    threadCwds,
    setThreadCwd,
    setSelectedThreadId,
    setModelsForAccount,
    queuedMessages,
    enqueueMessage,
    clearQueuedMessages,
    connectionStatus,
    setMessagesForThread,
    setAccountLoginId,
  } = useAppStore()

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId)
  const threadMessages = selectedThreadId ? messages[selectedThreadId] || [] : []
  const pendingApprovals = approvals.filter((approval) => approval.threadId === selectedThreadId && approval.status === 'pending')
  const isArchived = selectedThread?.status === 'archived'
  const threadAccountId = selectedThread?.accountId ?? selectedAccountId ?? ''
  const account = threadAccountId ? accounts.find((item) => item.id === threadAccountId) : undefined
  const models = threadAccountId ? modelsByAccount[threadAccountId] || [] : []
  const selectedModelId = selectedThreadId ? threadModels[selectedThreadId] : undefined
  const defaultModel = models.find((model) => model.isDefault) ?? models[0]
  const effectiveModel = selectedModelId ?? defaultModel?.id ?? ''
  const modelDetails = models.find((model) => model.id === effectiveModel) ?? defaultModel
  const effortOptions = (modelDetails?.supportedReasoningEfforts ?? []).map((effort) => ({
    value: effort.reasoningEffort,
    label: formatEffortLabel(effort.reasoningEffort),
    description: effort.description,
  }))
  const defaultEffort = modelDetails?.defaultReasoningEffort
  const selectedEffort = selectedThreadId ? threadEfforts[selectedThreadId] : undefined
  const effectiveEffort = selectedEffort ?? defaultEffort ?? null
  const selectedApproval = selectedThreadId ? threadApprovals[selectedThreadId] : undefined
  const selectedSummary = selectedThreadId ? threadSummaries[selectedThreadId] : undefined
  const selectedCwd = selectedThreadId ? threadCwds[selectedThreadId] : undefined
  const selectedUsage = selectedThreadId ? threadTokenUsage[selectedThreadId] : undefined
  const webSearchEnabled = selectedThreadId ? threadWebSearch[selectedThreadId] ?? false : false
  const isAccountReady = account?.status === 'online'
  const isAuthPending = account?.status === 'degraded'
  const canInteract = connectionStatus === 'connected' && !isArchived && isAccountReady
  const isTaskRunning = selectedThread?.status === 'active'
  const queuedCount = selectedThreadId ? queuedMessages[selectedThreadId]?.length ?? 0 : 0
  const slashInput = parseSlashInput(inputValue)
  const slashQuery = getSlashQuery(inputValue)
  const slashMatches = slashQuery !== null ? filterSlashCommands(slashQuery, promptCommands) : []
  const slashMenuOpen = slashQuery !== null && !slashInput?.rest && slashMatches.length > 0
  
  // @ mention detection
  const getMentionQuery = (text: string): string | null => {
    const cursorPos = text.length // Assume cursor at end
    const beforeCursor = text.slice(0, cursorPos)
    const atIndex = beforeCursor.lastIndexOf('@')
    if (atIndex === -1) return null
    // Check there's no space between @ and cursor
    const afterAt = beforeCursor.slice(atIndex + 1)
    if (afterAt.includes(' ') || afterAt.includes('\n')) return null
    return afterAt
  }
  const mentionQuery = getMentionQuery(inputValue)
  const mentionMenuOpen = mentionQuery !== null && !slashMenuOpen
  const mentionMatches = mentionMenuOpen ? fileSearchResults : []
  
  const modelOptions = models.map((model): SelectOption => ({
    value: model.id,
    label: model.displayName || model.model,
    description: model.description,
  }))
  const pendingModelDetails = models.find((model) => model.id === pendingModelId) ?? defaultModel
  const pendingEffortOptions = (pendingModelDetails?.supportedReasoningEfforts ?? []).map((effort) => ({
    value: effort.reasoningEffort,
    label: formatEffortLabel(effort.reasoningEffort),
    description: effort.description,
  }))
  const summaryOptions: SelectOption[] = (['auto', 'concise', 'detailed', 'none'] as ReasoningSummary[]).map(
    (value) => ({
      value,
      label: reasoningSummaryLabel(value),
      description: reasoningSummaryDescription(value),
    })
  )
  const approvalPolicyValues: ApprovalPolicy[] = [
    'untrusted',
    'on-request',
    'on-failure',
    'never',
  ]
  const approvalOptions: Array<{ value: ApprovalPolicy; label: string; description: string }> = approvalPolicyValues.map(
    (value) => ({
      value,
      label: approvalPolicyLabel(value),
      description: approvalPolicyDescription(value),
    })
  )
  const resumeCandidates = threadAccountId
    ? threads.filter((thread) => thread.accountId === threadAccountId)
    : []

  useEffect(() => {
    if (slashMenuOpen) {
      setSlashIndex(0)
    }
  }, [slashMenuOpen, slashQuery])

  useEffect(() => {
    if (mentionMenuOpen) {
      setMentionIndex(0)
    }
  }, [mentionMenuOpen, mentionQuery])

  useEffect(() => {
    if (connectionStatus !== 'connected' || !account) {
      setPromptCommands([])
      return
    }
    let cancelled = false
    const loadPrompts = async () => {
      try {
        const prompts = await hubClient.listPrompts(account.id)
        if (cancelled) {
          return
        }
        const commands = prompts.map((prompt) => {
          return {
            id: `prompts:${prompt.name}`,
            description: prompt.description || 'custom prompt',
            availableDuringTask: false,
          } as SlashCommandDefinition
        })
        setPromptCommands(commands)
      } catch {
        if (!cancelled) {
          setPromptCommands([])
        }
      }
    }
    void loadPrompts()
    return () => {
      cancelled = true
    }
  }, [account, connectionStatus])

  useEffect(() => {
    if (!mentionQuery || !account) {
      setFileSearchResults([])
      return
    }
    
    let cancelled = false
    const searchFiles = async () => {
      try {
        const result = await hubClient.request(account.id, 'command/exec', {
          command: ['find', '.', '-type', 'f', '-name', `*${mentionQuery}*`, '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*'],
          timeoutMs: 3000,
          cwd: null,
          sandboxPolicy: null,
        }) as { stdout: string; stderr: string; exitCode: number }
        
        if (cancelled) return
        
        if (result.exitCode === 0 && result.stdout) {
          const files = result.stdout
            .split('\n')
            .filter(Boolean)
            .slice(0, 10)
            .map((path) => ({
              path: path.replace(/^\.\//, ''),
              name: path.split('/').pop() || path,
            }))
          setFileSearchResults(files)
        } else {
          setFileSearchResults([])
        }
      } catch {
        if (!cancelled) {
          setFileSearchResults([])
        }
      }
    }
    
    const debounce = setTimeout(searchFiles, 150)
    return () => {
      cancelled = true
      clearTimeout(debounce)
    }
  }, [mentionQuery, account])

  useEffect(() => {
    return () => {
      if (authPollRef.current) {
        window.clearTimeout(authPollRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (showModelDialog) {
      setPendingModelId(effectiveModel)
      setPendingEffort((effectiveEffort ?? '') as ReasoningEffort | '')
      setPendingSummary((selectedSummary ?? 'auto') as ReasoningSummary)
      setPendingCwd(selectedCwd ?? '')
    }
  }, [showModelDialog, effectiveModel, effectiveEffort, selectedSummary, selectedCwd])

  useEffect(() => {
    if (!showModelDialog) {
      return
    }
    const supported = new Set(pendingEffortOptions.map((option) => option.value))
    if (pendingEffort && !supported.has(pendingEffort)) {
      setPendingEffort((pendingModelDetails?.defaultReasoningEffort ?? '') as ReasoningEffort | '')
    }
  }, [pendingEffort, pendingEffortOptions, pendingModelDetails, showModelDialog])

  useEffect(() => {
    if (showApprovalsDialog) {
      setPendingApproval(selectedApproval ?? 'on-request')
    }
  }, [showApprovalsDialog, selectedApproval])

  useEffect(() => {
    if (!showSkillsDialog || !account) {
      return
    }
    let cancelled = false
    const loadSkills = async () => {
      setSkillsLoading(true)
      setSkillsError(null)
      try {
        const result = (await hubClient.request(account.id, 'skills/list', {
          cwds: [],
        })) as { data?: Array<{ skills?: Array<{ name: string; description?: string; shortDescription?: string; path: string }> }> }
        if (cancelled) {
          return
        }
        const skills = result.data?.flatMap((entry) => entry.skills ?? []) ?? []
        setSkillsList(
          skills.map((skill) => ({
            name: skill.name,
            description: skill.shortDescription || skill.description || 'Skill',
            path: skill.path,
          }))
        )
      } catch {
        if (!cancelled) {
          setSkillsError('Failed to load skills.')
        }
      } finally {
        if (!cancelled) {
          setSkillsLoading(false)
        }
      }
    }
    loadSkills()
    return () => {
      cancelled = true
    }
  }, [showSkillsDialog, account])

  const focusComposer = () => {
    textareaRef.current?.focus()
  }

  const setComposerValue = (value: string) => {
    setInputValue(value)
    requestAnimationFrame(() => {
      focusComposer()
    })
  }

  const autocompleteSlashCommand = (command: SlashCommandDefinition) => {
    setComposerValue(`/${command.id} `)
  }

  const addSystemMessage = (kind: MessageKind, title: string, content: string) => {
    if (!selectedThreadId) {
      return
    }
    addMessage(selectedThreadId, {
      id: `sys-${Date.now()}`,
      role: 'assistant',
      content,
      kind,
      title,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    })
  }

  const sendTurn = async (text: string) => {
    if (!selectedThreadId || !selectedThread) {
      return
    }
    if (!canInteract) {
      // Show an alert if the user tries to send but can't
      if (connectionStatus !== 'connected') {
        setAlertDialog({
          open: true,
          title: 'Not Connected',
          message: 'Backend not connected. Please refresh the page.',
          variant: 'error',
        })
      } else if (!isAccountReady) {
        setAlertDialog({
          open: true,
          title: 'Account Not Ready',
          message: 'This account is not authenticated. Please sign in first.',
          variant: 'warning',
        })
      }
      return
    }

    if (isTaskRunning) {
      enqueueMessage(selectedThreadId, {
        id: `queue-${Date.now()}`,
        text,
        model: effectiveModel || undefined,
        effort: effectiveEffort ?? null,
        summary: selectedSummary ?? null,
        cwd: selectedCwd ?? null,
        approvalPolicy: selectedApproval ?? null,
        createdAt: Date.now(),
      })
      setInputValue('')
      return
    }

    let displayContent = text
    if (fileMentions.length > 0) {
      const mentionList = fileMentions.map(m => `@${m.path}`).join(' ')
      displayContent = `${mentionList}\n\n${text}`
    }

    addMessage(selectedThreadId, {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: displayContent,
      kind: 'chat',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    })
    setInputValue('')

    try {
      updateThread(selectedThreadId, { status: 'active' })
      
      // Build input array with text, images, and file references
      const input: Array<{ type: string; text?: string; url?: string; path?: string }> = []
      
      // Add file mentions as text references
      if (fileMentions.length > 0) {
        const mentionText = fileMentions.map(m => `@${m.path}`).join(' ')
        input.push({ type: 'text', text: `${mentionText}\n\n${text}` })
      } else {
        input.push({ type: 'text', text })
      }
      
      // Add image attachments
      for (const attachment of attachments) {
        if (attachment.type === 'image' && attachment.url) {
          input.push({ type: 'image', url: attachment.url })
        }
      }
      
      const params: {
        threadId: string
        input: Array<{ type: string; text?: string; url?: string; path?: string }>
        model?: string
        effort?: string
        summary?: ReasoningSummary
        cwd?: string
        approvalPolicy?: ApprovalPolicy
      } = {
        threadId: selectedThreadId,
        input,
      }
      if (effectiveModel) {
        params.model = effectiveModel
      }
      if (effectiveEffort) {
        params.effort = effectiveEffort
      }
      if (selectedApproval) {
        params.approvalPolicy = selectedApproval
      }
      if (selectedSummary) {
        params.summary = selectedSummary
      }
      if (selectedCwd) {
        params.cwd = selectedCwd
      }
      
      setAttachments([])
      setFileMentions([])
      
      await hubClient.request(selectedThread.accountId, 'turn/start', {
        ...params,
      })
    } catch (error) {
      console.error('[sendTurn] Error:', error)
      updateThread(selectedThreadId, { status: 'idle' })
    }
  }

  const startNewThread = async (accountId: string, approvalOverride?: ApprovalPolicy | null, webSearch?: boolean) => {
    const accountModels = modelsByAccount[accountId] || []
    const defaultThreadModel = accountModels.find((model) => model.isDefault) ?? accountModels[0]
    const params: { model?: string; approvalPolicy?: ApprovalPolicy; config?: Record<string, unknown> } = {}
    if (defaultThreadModel?.id) {
      params.model = defaultThreadModel.id
    }
    if (approvalOverride) {
      params.approvalPolicy = approvalOverride
    }
    if (webSearch) {
      params.config = { 'features.web_search_request': true }
    }

    const result = (await hubClient.request(accountId, 'thread/start', params)) as {
      thread?: {
        id: string
        preview?: string
        modelProvider?: string
        createdAt?: number
      }
      reasoningEffort?: ReasoningEffort | null
      approvalPolicy?: ApprovalPolicy | null
    }

    if (!result.thread) {
      return
    }

    const threadId = result.thread.id
    addThread({
      id: threadId,
      accountId,
      title: result.thread.preview?.trim() || 'Untitled session',
      preview: result.thread.preview?.trim() || 'New session started',
      model: result.thread.modelProvider ?? 'unknown',
      createdAt: result.thread.createdAt
        ? new Date(result.thread.createdAt * 1000).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : '',
      status: 'idle',
      messageCount: 0,
    })
    // Initialize empty messages array to prevent thread/resume from being called
    setMessagesForThread(threadId, [])
    setSelectedThreadId(threadId)
    if (defaultThreadModel?.id) {
      setThreadModel(threadId, defaultThreadModel.id)
      if (defaultThreadModel.defaultReasoningEffort) {
        setThreadEffort(threadId, defaultThreadModel.defaultReasoningEffort)
      }
    }
    const effort = result.reasoningEffort ?? defaultThreadModel?.defaultReasoningEffort
    if (effort) {
      setThreadEffort(threadId, effort)
    }
    if (selectedSummary) {
      setThreadSummary(threadId, selectedSummary)
    }
    if (selectedCwd) {
      setThreadCwd(threadId, selectedCwd)
    }
    const normalizedApproval = normalizeApprovalPolicy(result.approvalPolicy ?? null)
    const approval = normalizedApproval ?? approvalOverride ?? null
    if (approval) {
      setThreadApproval(threadId, approval)
    }
    if (webSearch) {
      setThreadWebSearch(threadId, true)
    }
  }

  const runDiffCommand = async (pathFilter?: string) => {
    if (!account || !selectedThreadId) {
      return
    }
    const exec = async (command: string[]) => {
      return (await hubClient.request(account.id, 'command/exec', {
        command,
        timeoutMs: 15000,
        cwd: null,
        sandboxPolicy: null,
      })) as { stdout: string; stderr: string; exitCode: number }
    }
    const repoCheck = await exec(['git', 'rev-parse', '--is-inside-work-tree'])
    if (repoCheck.exitCode !== 0) {
      addSystemMessage('command', '/diff', 'Not inside a git repository.')
      return
    }

    const tracked = await exec(pathFilter ? ['git', 'diff', '--', pathFilter] : ['git', 'diff'])
    const untrackedList = await exec(['git', 'ls-files', '--others', '--exclude-standard'])
    const untrackedFiles = untrackedList.stdout.split('\n').map((line) => line.trim()).filter(Boolean)

    let untrackedDiff = ''
    for (const file of untrackedFiles) {
      const diff = await exec(['git', 'diff', '--no-index', '--', '/dev/null', file])
      if (diff.stdout) {
        untrackedDiff += diff.stdout
      }
    }

    const combined = `${tracked.stdout}${untrackedDiff}`.trim()
    const content = combined
      ? `\`\`\`diff\n${combined}\n\`\`\``
      : 'No changes detected.'
    addSystemMessage('command', '/diff', content)
  }

  const runStatusCommand = () => {
    if (!account || !selectedThreadId) {
      return
    }
    const usageLine = selectedUsage ? `Token usage: ${JSON.stringify(selectedUsage)}` : null
    const lines = [
      `Account: ${account.name} (${account.status})`,
      `Model: ${effectiveModel || 'default'}`,
      `Reasoning effort: ${effectiveEffort ?? 'default'}`,
      `Reasoning summary: ${selectedSummary ?? 'default'}`,
      `Working directory: ${selectedCwd || 'default'}`,
      `Approvals: ${selectedApproval ?? 'default'}`,
      `Connection: ${connectionStatus}`,
    ]
    if (usageLine) {
      lines.push(usageLine)
    }
    addSystemMessage('tool', '/status', lines.join('\n'))
  }

  const runMcpCommand = async (target?: string) => {
    if (!account) {
      return
    }
    if (target) {
      const result = (await hubClient.request(account.id, 'mcpServer/oauth/login', {
        name: target,
      })) as { authorization_url?: string; authorizationUrl?: string; authUrl?: string }
      const authUrl = result.authorization_url ?? result.authorizationUrl ?? result.authUrl
      if (authUrl) {
        const opened = window.open(authUrl, '_blank', 'noopener,noreferrer')
        if (!opened) {
          setCopyDialog({ open: true, url: authUrl })
        }
        addSystemMessage('tool', '/mcp', `Opened OAuth flow for ${target}.`)
      } else {
        addSystemMessage('tool', '/mcp', `Unable to start OAuth flow for ${target}.`)
      }
      return
    }

    const result = (await hubClient.request(account.id, 'mcpServerStatus/list', {
      limit: 100,
      cursor: null,
    })) as { data?: Array<{ name: string; authStatus?: string; tools?: Record<string, unknown> }> }
    const servers = result.data ?? []
    if (!servers.length) {
      addSystemMessage('tool', '/mcp', 'No MCP servers configured.')
      return
    }
    const content = servers
      .map((server) => {
        const toolCount = Object.keys(server.tools ?? {}).length
        const status = server.authStatus ?? 'unknown'
        return `${server.name} · ${status} · ${toolCount} tools`
      })
      .join('\n')
    addSystemMessage('tool', '/mcp', content)
  }

  const runReviewCommand = async (instructions?: string) => {
    if (!selectedThreadId || !account) {
      return
    }
    const target = instructions
      ? { type: 'custom', instructions }
      : { type: 'uncommittedChanges' }
    await hubClient.request(account.id, 'review/start', {
      threadId: selectedThreadId,
      target,
      delivery: 'inline',
    })
    updateThread(selectedThreadId, { status: 'active' })
  }

  const runLogoutCommand = async () => {
    if (!account) {
      return
    }
    await hubClient.request(account.id, 'account/logout')
    updateAccount(account.id, (prev) => ({ ...prev, status: 'offline' }))
    addSystemMessage('tool', '/logout', 'Logged out. Authenticate again to resume sessions.')
  }

  const runSlashCommand = async (command: SlashCommandDefinition, rest: string) => {
    if (!command.availableDuringTask && isTaskRunning) {
      addSystemMessage('tool', `/${command.id}`, `/${command.id} is disabled while a task is running.`)
      return
    }
    const needsConnection = ['review', 'new', 'init', 'compact', 'diff', 'mcp', 'feedback', 'logout', 'skills'].includes(command.id)
      || command.id.startsWith('prompts:')
    if (needsConnection) {
      if (connectionStatus !== 'connected') {
        setAlertDialog({
          open: true,
          title: 'Not Connected',
          message: 'Backend not connected. Start the hub and refresh the page.',
          variant: 'error',
        })
        return
      }
      if (!isAccountReady) {
        setAlertDialog({
          open: true,
          title: 'Authentication Required',
          message: 'Authenticate this account before running this command.',
          variant: 'warning',
        })
        return
      }
    }

    try {
      if (command.id.startsWith('prompts:')) {
        if (!account) {
          return
        }
        const promptName = command.id.slice('prompts:'.length)
        const raw = await hubClient.readPrompt(account.id, promptName)
        const content = expandPromptTemplate(stripPromptFrontmatter(raw), rest)
        if (!content.trim()) {
          addSystemMessage('tool', '/prompts', `Prompt ${promptName} was empty.`)
          return
        }
        await sendTurn(content.trim())
        return
      }

      switch (command.id) {
        case 'mention': {
          const value = rest ? `@${rest}` : '@'
          setComposerValue(value)
          return
        }
        case 'skills': {
          if (rest) {
            setComposerValue(`$${rest}`)
            return
          }
          setShowSkillsDialog(true)
          return
        }
        case 'model': {
          if (rest) {
            const match = models.find((model) =>
              [model.id, model.model, model.displayName].some(
                (value) => value && value.toLowerCase() === rest.toLowerCase()
              )
            )
            if (match && selectedThreadId) {
              setThreadModel(selectedThreadId, match.id)
              if (match.defaultReasoningEffort) {
                setThreadEffort(selectedThreadId, match.defaultReasoningEffort)
              }
              return
            }
          }
          setShowModelDialog(true)
          return
        }
        case 'summary': {
          const summary = normalizeReasoningSummary(rest)
          if (summary && selectedThreadId) {
            setThreadSummary(selectedThreadId, summary)
            addSystemMessage('tool', '/summary', `Reasoning summary set to ${summary}.`)
            return
          }
          setShowModelDialog(true)
          return
        }
        case 'cwd': {
          const target = rest.trim()
          if (selectedThreadId && target) {
            if (target === 'clear' || target === 'reset') {
              setThreadCwd(selectedThreadId, '')
              addSystemMessage('tool', '/cwd', 'Working directory cleared.')
              return
            }
            setThreadCwd(selectedThreadId, target)
            addSystemMessage('tool', '/cwd', `Working directory set to ${target}.`)
            return
          }
          setShowModelDialog(true)
          return
        }
        case 'approvals': {
          const direct = normalizeApprovalPolicy(rest)
          if (direct) {
            if (selectedThreadId) {
              setThreadApproval(selectedThreadId, direct)
              addSystemMessage('tool', '/approvals', `Approval policy set to ${direct}.`)
            }
            return
          }
          setShowApprovalsDialog(true)
          return
        }
        case 'review': {
          await runReviewCommand(rest || undefined)
          return
        }
        case 'new': {
          const accountId = selectedAccountId ?? threadAccountId
          if (!accountId) {
            addSystemMessage('tool', '/new', 'Select an account before starting a new session.')
            return
          }
          await startNewThread(accountId, selectedApproval, webSearchEnabled)
          return
        }
        case 'resume': {
          setShowResumeDialog(true)
          return
        }
        case 'init': {
          await sendTurn(INIT_PROMPT)
          return
        }
        case 'compact': {
          await sendTurn('Summarize the conversation so far in a concise format for compaction.')
          return
        }
        case 'diff': {
          await runDiffCommand(rest || undefined)
          return
        }
        case 'status': {
          runStatusCommand()
          return
        }
        case 'mcp': {
          await runMcpCommand(rest || undefined)
          return
        }
        case 'feedback': {
          if (rest) {
            setFeedbackReason(rest)
          }
          setShowFeedbackDialog(true)
          return
        }
        case 'logout': {
          await runLogoutCommand()
          return
        }
        case 'quit':
        case 'exit': {
          addSystemMessage('tool', `/${command.id}`, 'Close this tab to exit Codex.')
          return
        }
        case 'experimental': {
          addSystemMessage('tool', '/experimental', 'Experimental features are not yet available in the web UI.')
          return
        }
        default:
          return
      }
    } catch {
      setAlertDialog({
        open: true,
        title: 'Command Failed',
        message: `/${command.id} did not complete successfully.`,
        variant: 'error',
      })
    }
  }

  const submitComposer = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) {
      return
    }
    const parsed = slashInput
    if (parsed && !parsed.name) {
      return
    }
    if (parsed?.name) {
      const match = findSlashCommand(parsed.name, promptCommands)
      if (match) {
        setInputValue('')
        await runSlashCommand(match, parsed.rest)
        return
      }
    }
    await sendTurn(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((prev) => (prev + 1) % slashMatches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((prev) => (prev - 1 + slashMatches.length) % slashMatches.length)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const selected = slashMatches[slashIndex]
        if (selected) {
          autocompleteSlashCommand(selected)
        }
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const selected = slashMatches[slashIndex]
        if (selected) {
          setInputValue('')
          void runSlashCommand(selected, '')
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setInputValue('')
        return
      }
    }
    
    if (mentionMenuOpen && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((prev) => (prev + 1) % mentionMatches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((prev) => (prev - 1 + mentionMatches.length) % mentionMatches.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        const selected = mentionMatches[mentionIndex]
        if (selected) {
          handleMentionSelect(selected)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        const atIndex = inputValue.lastIndexOf('@')
        if (atIndex !== -1) {
          setInputValue(inputValue.slice(0, atIndex))
        }
        return
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submitComposer()
    }
  }

  const handleMentionSelect = (mention: FileMention) => {
    // Add to file mentions list
    if (!fileMentions.find(m => m.path === mention.path)) {
      setFileMentions([...fileMentions, mention])
    }
    // Remove the @query from input
    const atIndex = inputValue.lastIndexOf('@')
    if (atIndex !== -1) {
      setInputValue(inputValue.slice(0, atIndex))
    }
  }

  const handleArchive = async () => {
    if (!selectedThreadId || !selectedThread || !canInteract) {
      return
    }
    try {
      await hubClient.request(selectedThread.accountId, 'thread/archive', {
        threadId: selectedThreadId,
      })
      updateThread(selectedThreadId, { status: 'archived' })
      clearQueuedMessages(selectedThreadId)
      if (activeTab !== 'archive') {
        setInputValue('')
      }
    } catch {
      // TODO: surface error state.
    }
  }

  const refreshAccountStatus = async (profileId: string, silent = false) => {
    try {
      await refreshAccountSnapshot(profileId, updateAccount, setModelsForAccount)
    } catch {
      if (!silent) {
        setAlertDialog({
          open: true,
          title: 'Status Check Failed',
          message: 'Unable to refresh account status right now.',
          variant: 'error',
        })
      }
    }
  }

  const scheduleAuthPolling = (profileId: string, remaining = 6) => {
    if (remaining <= 0) {
      return
    }
    if (authPollRef.current) {
      window.clearTimeout(authPollRef.current)
    }
    authPollRef.current = window.setTimeout(async () => {
      await refreshAccountStatus(profileId, true)
      const updatedAccount = useAppStore.getState().accounts.find((item) => item.id === profileId)
      if (updatedAccount?.status === 'online') {
        return
      }
      scheduleAuthPolling(profileId, remaining - 1)
    }, 5000)
  }

  const handleChatgptAuth = async () => {
    if (!account) {
      return
    }
    try {
      const login = (await hubClient.request(account.id, 'account/login/start', {
        type: 'chatgpt',
      })) as { authUrl?: string; loginId?: string }
      updateAccount(account.id, (prev) => ({ ...prev, status: 'degraded' }))
      if (login?.loginId) {
        setAccountLoginId(account.id, login.loginId)
      }
      if (login?.authUrl) {
        const opened = window.open(login.authUrl, '_blank', 'noopener,noreferrer')
        if (!opened) {
          setCopyDialog({ open: true, url: login.authUrl })
        }
      }
      scheduleAuthPolling(account.id)
    } catch {
      setAlertDialog({
        open: true,
        title: 'Sign In Failed',
        message: 'Unable to start ChatGPT sign-in. Please try again.',
        variant: 'error',
      })
    }
  }

  const handleApiKeyAuth = async (apiKey: string) => {
    if (!account) {
      return
    }
    try {
      updateAccount(account.id, (prev) => ({ ...prev, status: 'degraded' }))
      await hubClient.request(account.id, 'account/login/start', {
        type: 'apiKey',
        apiKey,
      })
      setAccountLoginId(account.id, null)
      await refreshAccountStatus(account.id, true)
    } catch {
      setAlertDialog({
        open: true,
        title: 'API Key Failed',
        message: 'Unable to authenticate with that API key. Please check it and try again.',
        variant: 'error',
      })
    }
  }

  const handleCancelAuth = async () => {
    if (!account) {
      return
    }
    const loginId = accountLoginIds[account.id]
    if (!loginId) {
      return
    }
    try {
      await hubClient.request(account.id, 'account/login/cancel', {
        loginId,
      })
      setAccountLoginId(account.id, null)
    } catch {
      setAlertDialog({
        open: true,
        title: 'Cancel Failed',
        message: 'Unable to cancel the login flow right now.',
        variant: 'error',
      })
    }
  }

  const handleEmptyNewSession = async () => {
    if (connectionStatus !== 'connected') {
      setAlertDialog({
        open: true,
        title: 'Not Connected',
        message: 'Backend not connected. Start the hub and refresh the page.',
        variant: 'error',
      })
      return
    }
    const targetAccountId = selectedAccountId ?? accounts.find((item) => item.status === 'online')?.id ?? accounts[0]?.id
    if (!targetAccountId) {
      setAlertDialog({
        open: true,
        title: 'No Accounts',
        message: 'Add an account before creating a session.',
        variant: 'warning',
      })
      return
    }
    const targetAccount = accounts.find((item) => item.id === targetAccountId)
    if (targetAccount?.status !== 'online') {
      setAlertDialog({
        open: true,
        title: 'Authentication Required',
        message: 'Authenticate this account before creating a session.',
        variant: 'warning',
      })
      return
    }
    await startNewThread(targetAccountId, null)
  }

  const handleInterruptTurn = async () => {
    if (!account || !selectedThreadId) {
      return
    }
    const turnId = threadTurnIds[selectedThreadId]
    if (!turnId) {
      return
    }
    try {
      await hubClient.request(account.id, 'turn/interrupt', {
        threadId: selectedThreadId,
        turnId,
      })
    } catch {
      setAlertDialog({
        open: true,
        title: 'Interrupt Failed',
        message: 'Unable to stop the running turn. Please try again.',
        variant: 'error',
      })
    }
  }

  const applyModelDialog = () => {
    if (!selectedThreadId) {
      setShowModelDialog(false)
      return
    }
    if (pendingModelId) {
      setThreadModel(selectedThreadId, pendingModelId)
      const nextModel = models.find((model) => model.id === pendingModelId)
      if (nextModel?.defaultReasoningEffort) {
        setThreadEffort(selectedThreadId, nextModel.defaultReasoningEffort)
      }
    }
    if (pendingEffort) {
      setThreadEffort(selectedThreadId, pendingEffort as ReasoningEffort)
    }
    if (pendingSummary) {
      setThreadSummary(selectedThreadId, pendingSummary as ReasoningSummary)
    }
    if (pendingCwd.trim()) {
      setThreadCwd(selectedThreadId, pendingCwd.trim())
    } else {
      setThreadCwd(selectedThreadId, '')
    }
    setShowModelDialog(false)
  }

  const applyApprovalDialog = () => {
    if (selectedThreadId) {
      setThreadApproval(selectedThreadId, pendingApproval)
      addSystemMessage('tool', '/approvals', `Approval policy set to ${pendingApproval}.`)
    }
    setShowApprovalsDialog(false)
  }

  const handleSelectSkill = (name: string) => {
    setShowSkillsDialog(false)
    setComposerValue(`$${name}`)
  }

  const handleResumeThread = (threadId: string) => {
    setSelectedThreadId(threadId)
    setShowResumeDialog(false)
  }

  const handleSendFeedback = async () => {
    if (!account) {
      return
    }
    try {
      await hubClient.request(account.id, 'feedback/upload', {
        classification: feedbackCategory,
        reason: feedbackReason || null,
        threadId: selectedThreadId ?? null,
        includeLogs: feedbackIncludeLogs,
      })
      setShowFeedbackDialog(false)
      setFeedbackReason('')
      addSystemMessage('tool', '/feedback', 'Feedback sent. Thanks!')
    } catch {
      setAlertDialog({
        open: true,
        title: 'Feedback Failed',
        message: 'Unable to send feedback right now.',
        variant: 'error',
      })
    }
  }

  if (!selectedThread) {
    return <SessionEmpty onNewSession={handleEmptyNewSession} />
  }

  return (
    <main className="flex-1 flex flex-col h-full bg-bg-primary overflow-hidden">
      <SessionHeader
        title={selectedThread.title}
        accountName={account?.name}
        model={selectedThread.model}
        status={selectedThread.status}
        canInteract={canInteract}
        onArchive={handleArchive}
      />
      <SessionAuthBanner
        visible={!isAccountReady}
        pending={isAuthPending}
        onChatgpt={handleChatgptAuth}
        onApiKey={() => setShowApiKeyPrompt(true)}
        onCancel={account?.id && accountLoginIds[account.id] ? handleCancelAuth : undefined}
        onRefresh={account ? () => void refreshAccountStatus(account.id) : undefined}
      />
      <VirtualizedMessageList
        messages={threadMessages}
        approvals={pendingApprovals}
        queuedMessages={selectedThreadId ? queuedMessages[selectedThreadId] || [] : []}
        threadStatus={selectedThread.status}
        onApprove={(approval) => {
          hubClient.respond(approval.profileId, approval.requestId, { decision: 'accept' })
          resolveApproval(approval.id, 'approved')
        }}
        onApproveForSession={(approval) => {
          const result =
            approval.type === 'command'
              ? { decision: 'accept', acceptSettings: { forSession: true } }
              : { decision: 'accept' }
          hubClient.respond(approval.profileId, approval.requestId, result)
          resolveApproval(approval.id, 'approved')
          if (approval.threadId) {
            setThreadApproval(approval.threadId, 'never')
            addSystemMessage('tool', '/approvals', 'Approval policy set to never for this session.')
          }
        }}
        onDeny={(approval) => {
          hubClient.respond(approval.profileId, approval.requestId, { decision: 'decline' })
          resolveApproval(approval.id, 'denied')
        }}
        onInterrupt={selectedThreadId && threadTurnIds[selectedThreadId] ? handleInterruptTurn : undefined}
      />
      <SessionComposer
        inputValue={inputValue}
        onInputChange={(value) => setInputValue(value)}
        onKeyDown={handleKeyDown}
        onSend={() => void submitComposer()}
        onStop={handleInterruptTurn}
        textareaRef={textareaRef}
        canInteract={canInteract}
        slashMenuOpen={slashMenuOpen}
        slashMatches={slashMatches}
        slashIndex={slashIndex}
        isTaskRunning={isTaskRunning ?? false}
        onSlashSelect={autocompleteSlashCommand}
        onSlashHover={setSlashIndex}
        modelOptions={modelOptions}
        effortOptions={effortOptions}
        effectiveModel={effectiveModel}
        effectiveEffort={(effectiveEffort ?? '') as string}
        onModelChange={(value) => {
          if (selectedThreadId) {
            setThreadModel(selectedThreadId, value)
            const nextModel = models.find((model) => model.id === value)
            if (nextModel?.defaultReasoningEffort) {
              setThreadEffort(selectedThreadId, nextModel.defaultReasoningEffort)
            }
          }
        }}
        onEffortChange={(value) => {
          if (selectedThreadId) {
            setThreadEffort(selectedThreadId, value as ReasoningEffort)
          }
        }}
        showModelSelect={models.length > 0}
        showEffortSelect={effortOptions.length > 0}
        queuedCount={queuedCount}
        webSearchEnabled={webSearchEnabled}
        onWebSearchToggle={() => {
          if (selectedThreadId) {
            setThreadWebSearch(selectedThreadId, !webSearchEnabled)
          }
        }}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        fileMentions={fileMentions}
        onFileMentionsChange={setFileMentions}
        mentionMenuOpen={mentionMenuOpen}
        mentionQuery={mentionQuery ?? ''}
        mentionMatches={mentionMatches}
        mentionIndex={mentionIndex}
        onMentionSelect={handleMentionSelect}
        onMentionHover={setMentionIndex}
      />
      <SessionDialogs
        showModelDialog={showModelDialog}
        onCloseModelDialog={() => setShowModelDialog(false)}
        modelOptions={modelOptions}
        pendingModelId={pendingModelId}
        setPendingModelId={setPendingModelId}
        pendingEffortOptions={pendingEffortOptions}
        pendingEffort={pendingEffort}
        setPendingEffort={setPendingEffort}
        summaryOptions={summaryOptions}
        pendingSummary={pendingSummary}
        setPendingSummary={setPendingSummary}
        pendingCwd={pendingCwd}
        setPendingCwd={setPendingCwd}
        onApplyModel={applyModelDialog}
        showApprovalsDialog={showApprovalsDialog}
        onCloseApprovalsDialog={() => setShowApprovalsDialog(false)}
        approvalOptions={approvalOptions}
        pendingApproval={pendingApproval}
        setPendingApproval={setPendingApproval}
        onApplyApproval={applyApprovalDialog}
        showSkillsDialog={showSkillsDialog}
        onCloseSkillsDialog={() => setShowSkillsDialog(false)}
        skillsLoading={skillsLoading}
        skillsError={skillsError}
        skillsList={skillsList}
        onSelectSkill={handleSelectSkill}
        showResumeDialog={showResumeDialog}
        onCloseResumeDialog={() => setShowResumeDialog(false)}
        resumeCandidates={resumeCandidates}
        onResumeThread={handleResumeThread}
        showFeedbackDialog={showFeedbackDialog}
        onCloseFeedbackDialog={() => setShowFeedbackDialog(false)}
        feedbackCategory={feedbackCategory}
        setFeedbackCategory={setFeedbackCategory}
        feedbackReason={feedbackReason}
        setFeedbackReason={setFeedbackReason}
        feedbackIncludeLogs={feedbackIncludeLogs}
        setFeedbackIncludeLogs={setFeedbackIncludeLogs}
        onSendFeedback={handleSendFeedback}
        showApiKeyPrompt={showApiKeyPrompt}
        onCloseApiKeyPrompt={() => setShowApiKeyPrompt(false)}
        onApiKeySubmit={handleApiKeyAuth}
        copyDialog={copyDialog}
        setCopyDialog={setCopyDialog}
        alertDialog={alertDialog}
        setAlertDialog={setAlertDialog}
      />
    </main>
  )
}

const formatEffortLabel = (effort: string) => {
  if (effort === 'xhigh') return 'X-High'
  return effort.charAt(0).toUpperCase() + effort.slice(1)
}
