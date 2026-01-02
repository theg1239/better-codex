import { useState } from 'react'
import { useAppStore } from '../../store'
import { hubClient } from '../../services/hub-client'
import { Avatar, Button, Dialog, IconButton, Icons, SectionHeader, AlertDialog, PromptDialog, CopyDialog } from '../ui'
import { AccountUsagePanel } from './account-usage-panel'
import { SettingsDialog } from './settings-dialog'

export function Sidebar() {
  const [isAdding, setIsAdding] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showUsage, setShowUsage] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [authPendingId, setAuthPendingId] = useState<string | null>(null)
  const [removeDialog, setRemoveDialog] = useState<{ open: boolean; accountId: string; name: string }>({
    open: false,
    accountId: '',
    name: '',
  })
  const [alertDialog, setAlertDialog] = useState<{ open: boolean; title: string; message: string; variant: 'info' | 'warning' | 'error' }>({
    open: false,
    title: '',
    message: '',
    variant: 'info',
  })
  const [copyDialog, setCopyDialog] = useState<{ open: boolean; url: string }>({
    open: false,
    url: '',
  })
  const { 
    accounts, 
    selectedAccountId, 
    setSelectedAccountId,
    addAccount,
    removeAccount,
    updateAccount,
    connectionStatus,
  } = useAppStore()

  const getStatusColor = (status: 'online' | 'degraded' | 'offline') => {
    switch (status) {
      case 'online': return 'bg-accent-green'
      case 'degraded': return 'bg-yellow-500'
      case 'offline': return 'bg-text-muted'
    }
  }

  const handleChatgptAuth = async (accountId: string) => {
    if (connectionStatus !== 'connected') {
      setAlertDialog({
        open: true,
        title: 'Not Connected',
        message: 'Backend not connected. Start the hub and refresh the page.',
        variant: 'error',
      })
      return
    }
    setAuthPendingId(accountId)
    updateAccount(accountId, (prev) => ({ ...prev, status: 'degraded' }))
    try {
      const login = (await hubClient.request(accountId, 'account/login/start', {
        type: 'chatgpt',
      })) as { authUrl?: string }
      if (login?.authUrl) {
        const opened = window.open(login.authUrl, '_blank', 'noopener,noreferrer')
        if (!opened) {
          setCopyDialog({ open: true, url: login.authUrl })
        }
      }
    } catch {
      setAlertDialog({
        open: true,
        title: 'Sign In Failed',
        message: 'Unable to start ChatGPT sign-in. Please try again.',
        variant: 'error',
      })
    } finally {
      setAuthPendingId(null)
    }
  }

  return (
    <aside className="w-60 bg-bg-secondary border-r border-border flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent-green flex items-center justify-center">
            <span className="text-black text-xs font-bold">C</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-text-primary leading-none">Codex</h1>
            <p className="text-[10px] text-text-muted mt-0.5">Session Hub</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-3">
          <SectionHeader>Accounts</SectionHeader>
          <div className="space-y-0.5">
            {accounts.map((account) => (
              <div
                key={account.id}
                onClick={() => setSelectedAccountId(account.id === selectedAccountId ? null : account.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedAccountId(account.id === selectedAccountId ? null : account.id)
                  }
                }}
                role="button"
                tabIndex={0}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-text-muted ${
                  selectedAccountId === account.id 
                    ? 'bg-bg-elevated border border-border' 
                    : 'hover:bg-bg-hover border border-transparent'
                }`}
              >
                <div className="relative">
                  <Avatar name={account.name} size="sm" />
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg-secondary ${getStatusColor(account.status)}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary truncate">{account.name}</div>
                  <div className="text-[10px] text-text-muted">{account.plan}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {account.status !== 'online' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleChatgptAuth(account.id)
                      }}
                      disabled={authPendingId === account.id}
                      className="text-[10px] text-accent-green hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Sign in
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedAccountId(account.id)
                      setShowUsage(true)
                    }}
                    className="text-[10px] text-text-muted hover:text-text-primary transition-colors"
                  >
                    {account.rateLimit}%
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRemoveDialog({ open: true, accountId: account.id, name: account.name })
                    }}
                    disabled={account.id === 'default' || isRemoving}
                    className="p-1.5 rounded-lg transition-colors hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icons.Trash className="w-3.5 h-3.5 text-text-muted" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {showUsage && selectedAccountId && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <SectionHeader>Usage</SectionHeader>
              <button 
                onClick={() => setShowUsage(false)}
                className="p-1 rounded hover:bg-bg-hover"
              >
                <Icons.X className="w-3 h-3 text-text-muted" />
              </button>
            </div>
            <AccountUsagePanel />
          </div>
        )}

        <button
          className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-dashed border-border text-xs text-text-muted hover:text-text-secondary hover:border-text-muted transition-colors"
          onClick={() => {
            if (isAdding) return
            if (connectionStatus !== 'connected') {
              setAlertDialog({
                open: true,
                title: 'Not Connected',
                message: 'Backend not connected. Start the hub and refresh the page.',
                variant: 'error',
              })
              return
            }
            setShowPrompt(true)
          }}
        >
          <Icons.Plus className="w-3.5 h-3.5" />
          Add Account
        </button>

        <PromptDialog
          open={showPrompt}
          onClose={() => setShowPrompt(false)}
          onSubmit={async (name) => {
            if (isAdding) return
            setIsAdding(true)
            try {
              const profile = await hubClient.createProfile(name)
              addAccount({
                id: profile.id,
                name: profile.name,
                email: '',
                plan: 'Unknown',
                status: 'offline',
                rateLimit: 0,
              })
              setSelectedAccountId(profile.id)
              await hubClient.startProfile(profile.id)
              updateAccount(profile.id, (prev) => ({ ...prev, status: 'degraded' }))
              const login = (await hubClient.request(profile.id, 'account/login/start', {
                type: 'chatgpt',
              })) as { authUrl?: string }
              if (login?.authUrl) {
                const opened = window.open(login.authUrl, '_blank', 'noopener,noreferrer')
                if (!opened) {
                  setCopyDialog({ open: true, url: login.authUrl })
                }
              }
            } catch {
              setAlertDialog({
                open: true,
                title: 'Error',
                message: 'Failed to create account. Please try again.',
                variant: 'error',
              })
            } finally {
              setIsAdding(false)
            }
          }}
          title="Add Account"
          placeholder="Account name..."
          submitLabel="Create"
        />

        <AlertDialog
          open={alertDialog.open}
          onClose={() => setAlertDialog((prev) => ({ ...prev, open: false }))}
          title={alertDialog.title}
          message={alertDialog.message}
          variant={alertDialog.variant}
        />

        <CopyDialog
          open={copyDialog.open}
          onClose={() => setCopyDialog({ open: false, url: '' })}
          title="Sign In"
          message="Open this URL in your browser to sign in to your OpenAI account:"
          copyText={copyDialog.url}
        />

        <Dialog
          open={removeDialog.open}
          onClose={() => setRemoveDialog({ open: false, accountId: '', name: '' })}
          title="Remove Account"
        >
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Remove <span className="text-text-primary font-medium">{removeDialog.name}</span> from the hub? This
            does not delete any local sessions.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRemoveDialog({ open: false, accountId: '', name: '' })}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isRemoving}
              onClick={async () => {
                if (!removeDialog.accountId) {
                  return
                }
                if (removeDialog.accountId === 'default') {
                  setAlertDialog({
                    open: true,
                    title: 'Default Profile',
                    message: 'The default profile cannot be removed.',
                    variant: 'warning',
                  })
                  return
                }
                if (connectionStatus !== 'connected') {
                  setAlertDialog({
                    open: true,
                    title: 'Not Connected',
                    message: 'Backend not connected. Start the hub and refresh the page.',
                    variant: 'error',
                  })
                  return
                }
                const nextSelection = accounts.find((item) => item.id !== removeDialog.accountId)?.id ?? null
                setIsRemoving(true)
                try {
                  await hubClient.deleteProfile(removeDialog.accountId)
                  removeAccount(removeDialog.accountId)
                  if (selectedAccountId === removeDialog.accountId) {
                    setSelectedAccountId(nextSelection)
                  }
                  setRemoveDialog({ open: false, accountId: '', name: '' })
                } catch {
                  setAlertDialog({
                    open: true,
                    title: 'Error',
                    message: 'Failed to remove account. Please try again.',
                    variant: 'error',
                  })
                } finally {
                  setIsRemoving(false)
                }
              }}
            >
              Remove
            </Button>
          </div>
        </Dialog>

        <div className="mt-4">
          <SectionHeader>Workspaces</SectionHeader>
          <div className="space-y-0.5">
            <NavItem icon={<Icons.Grid className="w-4 h-4" />} label="Multi-account" active />
            <NavItem icon={<Icons.Clipboard className="w-4 h-4" />} label="Reviews" />
            <NavItem icon={<Icons.Archive className="w-4 h-4" />} label="Archives" />
            <NavItem icon={<Icons.Bolt className="w-4 h-4" />} label="Automations" />
          </div>
        </div>
      </div>

      <div className="p-2 border-t border-border">
        <div className="flex items-center gap-1">
          <IconButton 
            icon={<Icons.Settings className="w-4 h-4 text-text-muted" />} 
            size="sm"
            onClick={() => setShowSettings(true)}
          />
          <IconButton 
            icon={<Icons.Help className="w-4 h-4 text-text-muted" />} 
            size="sm"
          />
        </div>
      </div>

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
    </aside>
  )
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors text-left ${
      active 
        ? 'bg-bg-elevated border border-border' 
        : 'hover:bg-bg-hover border border-transparent'
    }`}>
      <span className={active ? 'text-text-secondary' : 'text-text-muted'}>{icon}</span>
      <span className={`text-xs ${active ? 'text-text-primary' : 'text-text-muted'}`}>{label}</span>
    </button>
  )
}
