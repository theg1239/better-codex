import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icons } from '../ui'
import type { Account } from '../../types'

interface ThreadAccountSwitcherProps {
  currentAccountId: string
  currentAccountName?: string
  accounts: Account[]
  disabled?: boolean
  onSwitch: (accountId: string) => void
}

export const ThreadAccountSwitcher = ({
  currentAccountId,
  currentAccountName,
  accounts,
  disabled,
  onSwitch,
}: ThreadAccountSwitcherProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter to only show other accounts that are online
  const availableAccounts = accounts.filter(
    (account) => account.id !== currentAccountId && account.status === 'online'
  )

  // Update dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      })
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSwitch = (accountId: string) => {
    onSwitch(accountId)
    setIsOpen(false)
  }

  const currentAccount = accounts.find((a) => a.id === currentAccountId)
  const hasRateLimitWarning = currentAccount?.usage?.primary?.usedPercent 
    ? currentAccount.usage.primary.usedPercent >= 80 
    : false

  const dropdownContent = isOpen && availableAccounts.length > 0 && (
    <div 
      ref={dropdownRef}
      className="fixed min-w-[200px] bg-bg-elevated border border-border rounded-lg shadow-lg py-1 z-[9999]"
      style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
    >
      <div className="px-3 py-2 border-b border-border">
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide">
          Switch Account
        </p>
        <p className="text-[10px] text-text-muted mt-0.5">
          Continue this thread with another account
        </p>
      </div>
      
      {/* Current account */}
      <div className="px-3 py-2 bg-bg-secondary/50">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            currentAccount?.status === 'online' ? 'bg-accent-green' : 'bg-text-muted'
          }`} />
          <span className="text-xs text-text-primary font-medium">
            {currentAccountName}
          </span>
          <span className="text-[10px] text-text-muted ml-auto">current</span>
        </div>
        {currentAccount?.usage?.primary && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 bg-bg-tertiary rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${
                  currentAccount.usage.primary.usedPercent >= 90 ? 'bg-accent-red' :
                  currentAccount.usage.primary.usedPercent >= 80 ? 'bg-yellow-500' :
                  'bg-accent-green'
                }`}
                style={{ width: `${Math.min(100, currentAccount.usage.primary.usedPercent)}%` }}
              />
            </div>
            <span className="text-[9px] text-text-muted">
              {Math.round(currentAccount.usage.primary.usedPercent)}%
            </span>
          </div>
        )}
      </div>

      {/* Available accounts */}
      <div className="py-1">
        {availableAccounts.map((account) => (
          <button
            key={account.id}
            onClick={() => handleSwitch(account.id)}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-hover transition-colors text-left"
          >
            <div className={`w-2 h-2 rounded-full ${
              account.status === 'online' ? 'bg-accent-green' : 'bg-text-muted'
            }`} />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-text-primary block truncate">
                {account.name}
              </span>
              {account.usage?.primary && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-bg-tertiary rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        account.usage.primary.usedPercent >= 90 ? 'bg-accent-red' :
                        account.usage.primary.usedPercent >= 80 ? 'bg-yellow-500' :
                        'bg-accent-green'
                      }`}
                      style={{ width: `${Math.min(100, account.usage.primary.usedPercent)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-text-muted">
                    {Math.round(account.usage.primary.usedPercent)}%
                  </span>
                </div>
              )}
            </div>
            <Icons.ArrowRight className="w-3 h-3 text-text-muted shrink-0" />
          </button>
        ))}
      </div>

      {hasRateLimitWarning && (
        <div className="px-3 py-2 border-t border-border bg-yellow-500/5">
          <p className="text-[10px] text-yellow-500">
            <Icons.Warning className="w-3 h-3 inline mr-1" />
            Current account is near rate limit. Consider switching.
          </p>
        </div>
      )}
    </div>
  )

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`group flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
          disabled 
            ? 'opacity-50 cursor-not-allowed' 
            : 'hover:bg-bg-hover cursor-pointer'
        } ${hasRateLimitWarning ? 'text-yellow-500' : ''}`}
        title={availableAccounts.length > 0 ? 'Switch account for this thread' : 'No other accounts available'}
      >
        <span className={`truncate max-w-[100px] text-[10px] ${hasRateLimitWarning ? 'text-yellow-500' : 'text-text-muted'}`}>
          {currentAccountName || 'Unknown account'}
        </span>
        {hasRateLimitWarning && (
          <Icons.Warning className="w-3 h-3 text-yellow-500 shrink-0" />
        )}
        {availableAccounts.length > 0 && !disabled && (
          <Icons.ChevronDown className={`w-3 h-3 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  )
}
