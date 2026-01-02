import { useAppStore } from '../../store'
import { Icons, IconButton } from '../ui'

interface MobileHeaderProps {
  title?: string
  showMenuButton?: boolean
  showThreadListButton?: boolean
  rightContent?: React.ReactNode
}

export function MobileHeader({ 
  title = 'better-codex',
  showMenuButton = true,
  showThreadListButton = true,
  rightContent
}: MobileHeaderProps) {
  const { 
    setMobileSidebarOpen,
    setMobileThreadListOpen,
    selectedThreadId,
    threads,
  } = useAppStore()

  const selectedThread = threads.find(t => t.id === selectedThreadId)
  const displayTitle = selectedThread?.title || title

  return (
    <header className="flex items-center justify-between h-14 px-3 border-b border-border bg-bg-secondary shrink-0 md:hidden">
      <div className="flex items-center gap-2 min-w-0">
        {showMenuButton && (
          <IconButton 
            icon={<Icons.Menu className="w-5 h-5 text-text-secondary" />}
            size="md"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open menu"
          />
        )}
        <h1 className="text-sm font-semibold text-text-primary truncate">
          {displayTitle}
        </h1>
      </div>
      
      <div className="flex items-center gap-1">
        {rightContent}
        {showThreadListButton && (
          <IconButton 
            icon={<Icons.List className="w-5 h-5 text-text-secondary" />}
            size="md"
            onClick={() => setMobileThreadListOpen(true)}
            aria-label="Open sessions"
          />
        )}
      </div>
    </header>
  )
}
