import { useState, useEffect } from 'react'
import { Icons, Button } from '../ui'
import type { Account } from '../../types'

interface RateLimitBannerProps {
  visible: boolean
  currentAccount?: Account
  availableAccounts: Account[]
  errorMessage?: string
  onSwitchAccount: (accountId: string) => void
  onDismiss: () => void
}

export const isRateLimitError = (message: string): boolean => {
  const lowerMessage = message.toLowerCase()
  return (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('usage limit') ||
    lowerMessage.includes('quota exceeded') ||
    lowerMessage.includes('too many requests') ||
    lowerMessage.includes('request limit') ||
    lowerMessage.includes('hit your usage limit') ||
    lowerMessage.includes('limit reached') ||
    lowerMessage.includes('try again') && lowerMessage.includes('limit')
  )
}

export const RateLimitBanner = ({
  visible,
  currentAccount,
  availableAccounts,
  errorMessage,
  onSwitchAccount,
  onDismiss,
}: RateLimitBannerProps) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  // Auto-select first available account
  useEffect(() => {
    if (availableAccounts.length > 0 && !selectedAccountId) {
      // Prefer accounts with lower usage
      const sorted = [...availableAccounts].sort((a, b) => {
        const aUsage = a.usage?.primary?.usedPercent ?? 0
        const bUsage = b.usage?.primary?.usedPercent ?? 0
        return aUsage - bUsage
      })
      setSelectedAccountId(sorted[0]?.id ?? null)
    }
  }, [availableAccounts, selectedAccountId])

  if (!visible) {
    return null
  }

  const handleSwitch = () => {
    if (selectedAccountId) {
      onSwitchAccount(selectedAccountId)
      onDismiss()
    }
  }

  const extractResetTime = (message: string): string | null => {
    const patterns = [
      /try again (?:at|after) ([^.]+)/i,
      /resets? (?:at|in) ([^.]+)/i,
      /available (?:at|after) ([^.]+)/i,
    ]
    for (const pattern of patterns) {
      const match = message.match(pattern)
      if (match) {
        return match[1].trim()
      }
    }
    return null
  }

  const resetTime = errorMessage ? extractResetTime(errorMessage) : null

  return (
    <div className="px-4 py-3 border-b border-border bg-bg-secondary/70">
      <div className="bg-bg-tertiary border border-border rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-bg-primary border border-border flex items-center justify-center">
            <Icons.Warning className="w-4 h-4 text-yellow-500" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">
              Usage Limit Reached
            </h3>
            <p className="text-xs text-text-muted mt-1">
              {currentAccount?.name || 'Current account'} has hit its usage limit.
              {resetTime && (
                <span className="block mt-0.5">
                  Resets: <span className="text-text-secondary">{resetTime}</span>
                </span>
              )}
            </p>

            {availableAccounts.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs text-text-secondary mb-2">
                  Continue with another account:
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableAccounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => setSelectedAccountId(account.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                        selectedAccountId === account.id
                          ? 'bg-accent-green-soft border-accent-green/50 text-accent-green'
                          : 'bg-bg-secondary border-border hover:border-text-muted text-text-secondary'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        account.status === 'online' ? 'bg-accent-green' : 'bg-text-muted'
                      }`} />
                      <span className="text-xs font-medium">{account.name}</span>
                      {account.usage?.primary && (
                        <span className={`text-[10px] ${
                          account.usage.primary.usedPercent >= 80 ? 'text-yellow-500' :
                          account.usage.primary.usedPercent >= 60 ? 'text-text-muted' :
                          'text-accent-green'
                        }`}>
                          {Math.round(account.usage.primary.usedPercent)}%
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSwitch}
                    disabled={!selectedAccountId}
                  >
                    <Icons.ArrowRight className="w-3.5 h-3.5" />
                    Switch Account
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDismiss}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <p className="text-xs text-text-muted">
                  No other accounts available. Add more accounts in the sidebar or wait for the limit to reset.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>

          <button
            onClick={onDismiss}
            className="shrink-0 p-1 rounded hover:bg-bg-hover transition-colors"
          >
            <Icons.X className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      </div>
    </div>
  )
}
