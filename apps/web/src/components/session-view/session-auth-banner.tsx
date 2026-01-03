import { Button, Icons } from '../ui'

interface SessionAuthBannerProps {
  visible: boolean
  pending: boolean
  onChatgpt: () => void
  onApiKey: () => void
  onRefresh?: () => void
  onCancel?: () => void
}

export const SessionAuthBanner = ({
  visible,
  pending,
  onChatgpt,
  onApiKey,
  onRefresh,
  onCancel,
}: SessionAuthBannerProps) => {
  if (!visible) {
    return null
  }

  return (
    <div className="px-4 py-3 border-b border-border bg-bg-secondary/70">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-tertiary px-4 py-4 shadow-lg">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(16,185,129,0.18),transparent_55%)]" />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-bg-primary border border-border flex items-center justify-center">
              <Icons.Warning className="w-4 h-4 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Connect this account</h3>
              <p className="text-xs text-text-muted mt-1">
                {pending
                  ? 'Waiting for sign-in to complete. Return here after authorizing the account.'
                  : 'Choose ChatGPT for the fastest setup, or drop in an API key for direct access.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={onChatgpt}>
              Sign in with ChatGPT
            </Button>
            <Button variant="ghost" size="sm" onClick={onApiKey}>
              Use API key
            </Button>
            {pending && onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel login
              </Button>
            )}
            {onRefresh && (
              <Button variant="ghost" size="sm" onClick={onRefresh}>
                Check status
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
