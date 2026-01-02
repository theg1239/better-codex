import { IconButton, Icons } from '../ui'
import { ThreadAccountSwitcher } from './thread-account-switcher'
import type { Account } from '../../types'

interface SessionHeaderProps {
  title: string
  accountId?: string
  accountName?: string
  accounts?: Account[]
  model?: string
  status?: string
  canInteract: boolean
  onArchive: () => void
  onSwitchAccount?: (accountId: string) => void
}

export const SessionHeader = ({
  title,
  accountId,
  accountName,
  accounts = [],
  model,
  status,
  canInteract,
  onArchive,
  onSwitchAccount,
}: SessionHeaderProps) => {
  const isActive = status === 'active'
  const showAccountSwitcher = accounts.length > 1 && accountId && onSwitchAccount

  return (
    <header className="hidden md:flex px-4 py-3 border-b border-border items-center justify-between shrink-0 gap-4">
      <div className="min-w-0 flex-1 overflow-hidden">
        <h2 className="text-sm font-semibold text-text-primary truncate">{title}</h2>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-text-muted">
          {showAccountSwitcher ? (
            <ThreadAccountSwitcher
              currentAccountId={accountId}
              currentAccountName={accountName}
              accounts={accounts}
              disabled={isActive}
              onSwitch={onSwitchAccount}
            />
          ) : (
            <span className="truncate max-w-[100px] px-2 py-1">{accountName || 'Unknown account'}</span>
          )}
          <span>·</span>
          <span>{model || 'unknown'}</span>
          <span>·</span>
          <span className={`flex items-center gap-1 ${isActive ? 'text-accent-green' : ''}`}>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />}
            {status || 'idle'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <IconButton icon={<Icons.Copy className="w-4 h-4 text-text-muted" />} size="sm" />
        <IconButton
          icon={<Icons.Archive className="w-4 h-4 text-text-muted" />}
          size="sm"
          disabled={!canInteract}
          onClick={onArchive}
        />
        <IconButton icon={<Icons.MoreVertical className="w-4 h-4 text-text-muted" />} size="sm" />
      </div>
    </header>
  )
}
