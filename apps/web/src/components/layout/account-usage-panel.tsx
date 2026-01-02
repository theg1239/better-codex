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

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'text-accent-red'
    if (percent >= 70) return 'text-yellow-500'
    return 'text-accent-green'
  }

  const getUsageBarColor = (percent: number) => {
    if (percent >= 90) return 'bg-accent-red'
    if (percent >= 70) return 'bg-yellow-500'
    return 'bg-accent-green'
  }

  // Always show current rateLimit even without full usage data
  const primaryPercent = usage?.primary?.usedPercent ?? account.rateLimit

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
          percent={primaryPercent}
          windowMinutes={usage?.primary?.windowMinutes ?? null}
          resetsAt={usage?.primary?.resetsAt ?? null}
          formatResetTime={formatResetTime}
          getUsageColor={getUsageColor}
          getUsageBarColor={getUsageBarColor}
        />

        {usage?.secondary && (
          <UsageBar
            label="Weekly"
            percent={usage.secondary.usedPercent}
            windowMinutes={usage.secondary.windowMinutes}
            resetsAt={usage.secondary.resetsAt}
            formatResetTime={formatResetTime}
            getUsageColor={getUsageColor}
            getUsageBarColor={getUsageBarColor}
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
  percent,
  windowMinutes,
  resetsAt,
  formatResetTime,
  getUsageColor,
  getUsageBarColor,
}: {
  label: string
  percent: number
  windowMinutes: number | null
  resetsAt: number | null
  formatResetTime: (resetsAt: number | null) => string | null
  getUsageColor: (percent: number) => string
  getUsageBarColor: (percent: number) => string
}) {
  const resetTime = formatResetTime(resetsAt)

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-muted">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${getUsageColor(percent)}`}>
            {Math.round(percent)}%
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
          className={`h-full transition-all duration-300 ${getUsageBarColor(percent)}`}
          style={{ width: `${Math.min(100, percent)}%` }}
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
