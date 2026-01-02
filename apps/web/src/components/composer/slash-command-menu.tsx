import type { SlashCommandDefinition } from '../../utils/slash-commands'

interface SlashCommandMenuProps {
  commands: SlashCommandDefinition[]
  activeIndex: number
  isTaskRunning: boolean
  onSelect: (command: SlashCommandDefinition) => void
  onHover: (index: number) => void
}

export function SlashCommandMenu({
  commands,
  activeIndex,
  isTaskRunning,
  onSelect,
  onHover,
}: SlashCommandMenuProps) {
  if (commands.length === 0) {
    return null
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[320px] bg-bg-secondary border border-border rounded-xl shadow-xl overflow-hidden z-50">
      <div className="max-h-[260px] overflow-y-auto py-1">
        {commands.map((command, index) => {
          const isActive = index === activeIndex
          const isDisabled = isTaskRunning && !command.availableDuringTask
          return (
            <button
              key={command.id}
              type="button"
              onClick={() => !isDisabled && onSelect(command)}
              onMouseEnter={() => onHover(index)}
              disabled={isDisabled}
              className={`w-full text-left px-3 py-2 transition-colors ${
                isActive ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-bg-hover'}`}
            >
              <div className="text-xs font-semibold">/{command.id}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{command.description}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
