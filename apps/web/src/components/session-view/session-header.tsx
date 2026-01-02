import { IconButton, Icons } from '../ui'

interface SessionHeaderProps {
  title: string
  accountName?: string
  model?: string
  status?: string
  canInteract: boolean
  onArchive: () => void
}

export const SessionHeader = ({
  title,
  accountName,
  model,
  status,
  canInteract,
  onArchive,
}: SessionHeaderProps) => {
  const isActive = status === 'active'

  return (
    <header className="hidden md:flex px-4 py-3 border-b border-border items-center justify-between shrink-0 gap-4">
      <div className="min-w-0 flex-1 overflow-hidden">
        <h2 className="text-sm font-semibold text-text-primary truncate">{title}</h2>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-muted">
          <span className="truncate max-w-[100px]">{accountName || 'Unknown account'}</span>
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
