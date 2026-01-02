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
      <div className="bg-bg-tertiary border border-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-bg-primary border border-border flex items-center justify-center">
            <Icons.Warning className="w-4 h-4 text-yellow-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Authenticate to start sessions</h3>
            <p className="text-xs text-text-muted mt-1">
              {pending
                ? 'Waiting for sign-in to complete. Return here after authorizing the account.'
                : 'This account is not signed in. Connect with ChatGPT or provide an API key to enable new sessions and messaging.'}
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
  )
}
