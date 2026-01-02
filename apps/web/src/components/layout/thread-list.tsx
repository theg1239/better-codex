import { useState, useEffect } from 'react'
import { useAppStore } from '../../store'
import { hubClient } from '../../services/hub-client'
import { Badge, Button, Icons, IconButton, Input, StatusDot } from '../ui'
import type { TabType, ReasoningEffort, Thread } from '../../types'
import { normalizeApprovalPolicy } from '../../utils/approval-policy'

interface ThreadListProps {
  onThreadSelect?: (threadId: string) => void
}

export function ThreadList({ onThreadSelect }: ThreadListProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Thread[] | null>(null)
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null)
  const [filterModel, setFilterModel] = useState<string | null>(null)
  const [filterDays, setFilterDays] = useState<number | null>(null)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showDateMenu, setShowDateMenu] = useState(false)
  
  const { 
    accounts,
    threads, 
    selectedAccountId, 
    selectedThreadId, 
    setSelectedThreadId,
    addThread,
    updateThread,
    activeTab,
    setActiveTab,
    modelsByAccount,
    setThreadModel,
    setThreadEffort,
    setThreadApproval,
    connectionStatus,
  } = useAppStore()

  useEffect(() => {
    const handleClickOutside = () => {
      setShowAccountMenu(false)
      setShowModelMenu(false)
      setShowDateMenu(false)
    }
    
    if (showAccountMenu || showModelMenu || showDateMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showAccountMenu, showModelMenu, showDateMenu])

  const accountThreads = selectedAccountId
    ? threads.filter(t => t.accountId === selectedAccountId)
    : threads

  const allModels = Array.from(new Set(threads.map(t => t.model))).filter(Boolean)

  const baseThreads = searchResults ?? accountThreads

  const filteredThreads = baseThreads.filter((thread) => {
    if (activeTab === 'archive') {
      if (thread.status !== 'archived') return false
    } else if (activeTab === 'reviews') {
      return false
    } else {
      if (thread.status === 'archived') return false
    }

    if (filterAccountId && thread.accountId !== filterAccountId) return false

    if (filterModel && thread.model !== filterModel) return false

    if (filterDays !== null && thread.createdAt) {
      const threadDate = new Date(thread.createdAt)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - filterDays)
      if (threadDate < cutoffDate) return false
    }

    return true
  })

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)
  const accountModels = selectedAccountId ? modelsByAccount[selectedAccountId] || [] : []
  const defaultModel = accountModels.find((model) => model.isDefault) ?? accountModels[0]
  const defaultEffort = defaultModel?.defaultReasoningEffort
  const isAccountReady = selectedAccount?.status === 'online'

  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchResults(null)
      return
    }
    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      try {
        const now = Math.floor(Date.now() / 1000)
        const createdAfter = filterDays ? now - filterDays * 24 * 60 * 60 : undefined
        const status = activeTab === 'archive' ? 'archived' : activeTab === 'sessions' ? 'active' : undefined
        const profileId = filterAccountId ?? selectedAccountId ?? undefined
        const results = await hubClient.searchThreads({
          query: trimmed,
          profileId,
          model: filterModel ?? undefined,
          status,
          createdAfter,
          limit: 100,
        })
        if (cancelled) {
          return
        }
        const mapped = results.map((row) => ({
          id: row.threadId,
          accountId: row.profileId,
          title: row.preview?.trim() || 'Untitled session',
          preview: row.preview?.trim() || 'No preview available yet.',
          model: row.modelProvider ?? 'unknown',
          createdAt: row.createdAt
            ? new Date(row.createdAt * 1000).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            : '',
          status: row.status,
          messageCount: 0,
        }))
        setSearchResults(mapped)
      } catch {
        if (!cancelled) {
          setSearchResults([])
        }
      }
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [searchQuery, filterAccountId, filterModel, filterDays, activeTab, selectedAccountId])

  const archiveThread = async (threadId: string, accountId: string) => {
    try {
      await hubClient.request(accountId, 'thread/archive', { threadId })
      updateThread(threadId, { status: 'archived' })
    } catch {
      // TODO: surface error state.
    }
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'sessions', label: 'Sessions' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'archive', label: 'Archive' },
  ]

  return (
    <div className="w-full md:w-80 bg-bg-primary border-r border-border flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <Input 
            placeholder="Search sessions..." 
            icon={<Icons.Search className="w-4 h-4" />}
            className="flex-1"
            value={searchQuery}
            onChange={(value) => setSearchQuery(value)}
          />
          {onThreadSelect && (
            <IconButton
              icon={<Icons.X className="w-4 h-4 text-text-muted" />}
              size="sm"
              onClick={() => onThreadSelect('')}
              className="md:hidden"
            />
          )}
        </div>
        
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-bg-elevated text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border flex gap-1.5 flex-wrap">
        <FilterChip 
          label={filterAccountId ? accounts.find(a => a.id === filterAccountId)?.name ?? 'Account' : 'All accounts'}
          open={showAccountMenu}
          onClick={(e) => {
            e.stopPropagation()
            setShowAccountMenu(!showAccountMenu)
            setShowModelMenu(false)
            setShowDateMenu(false)
          }}
          onClear={filterAccountId ? () => setFilterAccountId(null) : undefined}
        >
          {showAccountMenu && (
            <div className="absolute top-full left-0 mt-1 bg-bg-elevated border border-border rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
              <button
                onClick={() => {
                  setFilterAccountId(null)
                  setShowAccountMenu(false)
                }}
                className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover"
              >
                All accounts
              </button>
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => {
                    setFilterAccountId(account.id)
                    setShowAccountMenu(false)
                  }}
                  className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover"
                >
                  {account.name}
                </button>
              ))}
            </div>
          )}
        </FilterChip>

        <FilterChip 
          label={filterModel ?? 'Any model'}
          open={showModelMenu}
          onClick={(e) => {
            e.stopPropagation()
            setShowModelMenu(!showModelMenu)
            setShowAccountMenu(false)
            setShowDateMenu(false)
          }}
          onClear={filterModel ? () => setFilterModel(null) : undefined}
        >
          {showModelMenu && (
            <div className="absolute top-full left-0 mt-1 bg-bg-elevated border border-border rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
              <button
                onClick={() => {
                  setFilterModel(null)
                  setShowModelMenu(false)
                }}
                className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover"
              >
                Any model
              </button>
              {allModels.map((model) => (
                <button
                  key={model}
                  onClick={() => {
                    setFilterModel(model)
                    setShowModelMenu(false)
                  }}
                  className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover"
                >
                  {model}
                </button>
              ))}
            </div>
          )}
        </FilterChip>

        <FilterChip 
          label={filterDays === null ? 'All time' : filterDays === 1 ? 'Today' : filterDays === 7 ? 'Last 7 days' : filterDays === 30 ? 'Last 30 days' : `Last ${filterDays} days`}
          open={showDateMenu}
          onClick={(e) => {
            e.stopPropagation()
            setShowDateMenu(!showDateMenu)
            setShowAccountMenu(false)
            setShowModelMenu(false)
          }}
          onClear={filterDays !== null ? () => setFilterDays(null) : undefined}
        >
          {showDateMenu && (
            <div className="absolute top-full left-0 mt-1 bg-bg-elevated border border-border rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
              <button
                onClick={() => {
                  setFilterDays(null)
                  setShowDateMenu(false)
                }}
                className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover"
              >
                All time
              </button>
              <button
                onClick={() => {
                  setFilterDays(1)
                  setShowDateMenu(false)
                }}
                className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover"
              >
                Today
              </button>
              <button
                onClick={() => {
                  setFilterDays(7)
                  setShowDateMenu(false)
                }}
                className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover"
              >
                Last 7 days
              </button>
              <button
                onClick={() => {
                  setFilterDays(30)
                  setShowDateMenu(false)
                }}
                className="w-full text-left px-3 py-1.5 text-[10px] text-text-primary hover:bg-bg-hover"
              >
                Last 30 days
              </button>
            </div>
          )}
        </FilterChip>
      </div>

      <div className="p-2 border-b border-border">
        <Button
          variant="primary"
          fullWidth
          disabled={!selectedAccountId || connectionStatus !== 'connected' || isCreating || !isAccountReady}
          onClick={async () => {
            if (!selectedAccountId || isCreating || !isAccountReady) {
              return
            }
            setIsCreating(true)
            try {
              const params: { model?: string } = {}
              if (defaultModel?.id) {
                params.model = defaultModel.id
              }
              const result = (await hubClient.request(selectedAccountId, 'thread/start', params)) as {
                thread?: {
                  id: string
                  preview?: string
                  modelProvider?: string
                  createdAt?: number
                }
                reasoningEffort?: string | null
                approvalPolicy?: string | null
              }
              if (result.thread) {
                addThread({
                  id: result.thread.id,
                  accountId: selectedAccountId,
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
                setSelectedThreadId(result.thread.id)
                onThreadSelect?.(result.thread.id)
                if (defaultModel?.id) {
                  setThreadModel(result.thread.id, defaultModel.id)
                }
                const effort = (result.reasoningEffort ?? defaultEffort) as ReasoningEffort | null
                if (effort) {
                  setThreadEffort(result.thread.id, effort)
                }
                const approvalPolicy = normalizeApprovalPolicy(result.approvalPolicy)
                if (approvalPolicy) {
                  setThreadApproval(result.thread.id, approvalPolicy)
                }
              }
            } catch {
              // TODO: surface error state.
            } finally {
              setIsCreating(false)
            }
          }}
        >
          <Icons.Plus className="w-4 h-4" />
          New Session
        </Button>
        {selectedAccount && !isAccountReady && (
          <p className="mt-2 text-[10px] text-text-muted text-center">
            Authenticate this account to start a new session.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto touch-scroll p-1.5">
        {filteredThreads.map((thread) => {
          const account = accounts.find(a => a.id === thread.accountId)
          const isSelected = selectedThreadId === thread.id
          return (
            <div key={thread.id} className="relative group">
              <button
                onClick={() => {
                  setSelectedThreadId(thread.id)
                  onThreadSelect?.(thread.id)
                }}
                className={`w-full text-left p-2.5 pr-10 rounded-lg mb-0.5 transition-colors ${
                  isSelected
                    ? 'bg-bg-elevated border border-border'
                    : 'hover:bg-bg-hover active:bg-bg-elevated border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-xs font-medium text-text-primary truncate leading-tight flex-1 min-w-0">{thread.title}</h3>
                  {thread.status === 'active' && <StatusDot status="active" pulse />}
                </div>
                <p className="text-[10px] text-text-muted truncate mb-1.5">{thread.preview}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  <Badge>{account?.name}</Badge>
                  <span>·</span>
                  <span>{thread.model}</span>
                  {/* <span className="ml-auto">{thread.messageCount}</span> */}
                </div>
              </button>
              {activeTab !== 'archive' && (
                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <IconButton
                    icon={<Icons.Archive className="w-3.5 h-3.5 text-text-muted" />}
                    size="sm"
                    onClick={(e) => {
                      e?.stopPropagation()
                      void archiveThread(thread.id, thread.accountId)
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FilterChip({ 
  label, 
  open, 
  onClick, 
  onClear,
  children 
}: { 
  label: string
  open?: boolean
  onClick?: (e: React.MouseEvent) => void
  onClear?: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="relative">
      <button 
        onClick={(e) => {
          if (onClear) {
            e.stopPropagation()
            onClear()
          } else {
            onClick?.(e)
          }
        }}
        className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] transition-colors ${
          open 
            ? 'bg-bg-elevated border-border text-text-primary' 
            : 'bg-bg-tertiary border-border text-text-secondary hover:bg-bg-hover'
        }`}
      >
        {label}
        {onClear ? (
          <Icons.X className="w-2.5 h-2.5" />
        ) : (
          <Icons.ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {children}
    </div>
  )
}
