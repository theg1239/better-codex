import { useAppStore } from '../../store'
import { Icons, Badge } from '../ui'

export function AccountUsagePanel() {
  const { accounts, selectedAccountId } = useAppStore()
  const account = accounts.find((a) => a.id === selectedAccountId)

  if (!account) {
    return (
      <div className="bg-bg-tertiary border border-border rounded-xl p-4">
        <p className="text-xs text-text-muted">No account selected</p>
      </div>
    )
  }

  const { usage } = account

  const formatResetTime = (resetsAt: number | null) => {
    if (!resetsAt) return null
    const now = Date.now() / 1000
    const diff = resetsAt - now
    if (diff <= 0) return 'Resetting...'
    if (diff < 60) return `${Math.round(diff)}s`
    if (diff < 3600) return `${Math.round(diff / 60)}m`
    return `${Math.round(diff / 3600)}h`
  }

  const getRemainingColor = (percentLeft: number) => {
    if (percentLeft <= 10) return 'text-accent-red'
    if (percentLeft <= 30) return 'text-yellow-500'
    return 'text-accent-green'
  }

  const getRemainingBarColor = (percentLeft: number) => {
    if (percentLeft <= 10) return 'bg-accent-red'
    if (percentLeft <= 30) return 'bg-yellow-500'
    return 'bg-accent-green'
  }

  // Always show current rateLimit even without full usage data
  const primaryUsed = usage?.primary?.usedPercent ?? account.rateLimit

  return (
    <div className="bg-bg-tertiary border border-border rounded-xl p-3">
      <div className="flex items-center gap-2 mb-3">
        <Icons.Grid className="w-3.5 h-3.5 text-text-muted" />
        <h3 className="text-xs font-semibold text-text-primary">{account.name}</h3>
        {(usage?.planType || account.plan !== 'Unknown') && (
          <Badge variant="success">{usage?.planType || account.plan}</Badge>
        )}
      </div>

      <div className="space-y-3">
        <UsageBar
          label="5 Hours"
          usedPercent={primaryUsed}
          windowMinutes={usage?.primary?.windowMinutes ?? null}
          resetsAt={usage?.primary?.resetsAt ?? null}
          formatResetTime={formatResetTime}
          getRemainingColor={getRemainingColor}
          getRemainingBarColor={getRemainingBarColor}
        />

        {usage?.secondary && (
          <UsageBar
            label="Weekly"
            usedPercent={usage.secondary.usedPercent}
            windowMinutes={usage.secondary.windowMinutes}
            resetsAt={usage.secondary.resetsAt}
            formatResetTime={formatResetTime}
            getRemainingColor={getRemainingColor}
            getRemainingBarColor={getRemainingBarColor}
          />
        )}

        {usage?.credits && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Credits</span>
              <div className="flex items-center gap-1.5">
                {usage.credits.unlimited ? (
                  <Badge variant="success">Unlimited</Badge>
                ) : usage.credits.balance ? (
                  <span className="text-xs font-medium text-text-primary">
                    ${usage.credits.balance}
                  </span>
                ) : (
                  <span className={`text-[10px] ${usage.credits.hasCredits ? 'text-accent-green' : 'text-accent-red'}`}>
                    {usage.credits.hasCredits ? 'Available' : 'Exhausted'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-border space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted">Status</span>
            <span className={`text-[10px] font-medium ${
              account.status === 'online' ? 'text-accent-green' : 
              account.status === 'degraded' ? 'text-yellow-500' : 'text-text-muted'
            }`}>
              {account.status}
            </span>
          </div>
          {account.email && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Email</span>
              <span className="text-[10px] text-text-secondary truncate max-w-[120px]">{account.email}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function UsageBar({
  label,
  usedPercent,
  windowMinutes,
  resetsAt,
  formatResetTime,
  getRemainingColor,
  getRemainingBarColor,
}: {
  label: string
  usedPercent: number
  windowMinutes: number | null
  resetsAt: number | null
  formatResetTime: (resetsAt: number | null) => string | null
  getRemainingColor: (percentLeft: number) => string
  getRemainingBarColor: (percentLeft: number) => string
}) {
  const resetTime = formatResetTime(resetsAt)
  const percentLeft = Math.max(0, Math.min(100, 100 - usedPercent))

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-muted">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${getRemainingColor(percentLeft)}`}>
            {Math.round(percentLeft)}% left
          </span>
          {windowMinutes && (
            <span className="text-[10px] text-text-muted">
              / {windowMinutes}m window
            </span>
          )}
        </div>
      </div>
      <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${getRemainingBarColor(percentLeft)}`}
          style={{ width: `${percentLeft}%` }}
        />
      </div>
      {resetTime && (
        <p className="text-[10px] text-text-muted mt-1">
          Resets in {resetTime}
        </p>
      )}
    </div>
  )
}
