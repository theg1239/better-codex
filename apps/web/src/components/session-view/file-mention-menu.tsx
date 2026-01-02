import { Icons } from '../ui'
import type { FileMention } from '../../types'

interface FileMentionMenuProps {
  matches: FileMention[]
  activeIndex: number
  query: string
  onSelect: (mention: FileMention) => void
  onHover: (index: number) => void
}

export function FileMentionMenu({
  matches,
  activeIndex,
  query,
  onSelect,
  onHover,
}: FileMentionMenuProps) {
  if (matches.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg-elevated border border-border rounded-lg shadow-lg max-h-[200px] overflow-y-auto z-20">
      <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border">
        Files matching "{query}"
      </div>
      {matches.map((match, index) => (
        <button
          key={match.path}
          onClick={() => onSelect(match)}
          onMouseEnter={() => onHover(index)}
          className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
            index === activeIndex
              ? 'bg-bg-hover'
              : 'hover:bg-bg-hover/50'
          }`}
        >
          <Icons.File className="w-3.5 h-3.5 text-accent-blue shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-text-primary truncate">{match.name}</div>
            <div className="text-[10px] text-text-muted truncate">{match.path}</div>
          </div>
        </button>
      ))}
    </div>
  )
}
