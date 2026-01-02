import type { KeyboardEvent, RefObject } from 'react'
import { SlashCommandMenu } from '../composer/slash-command-menu'
import { Button, IconButton, Icons, Select, type SelectOption } from '../ui'
import type { SlashCommandDefinition } from '../../utils/slash-commands'

interface SessionComposerProps {
  inputValue: string
  onInputChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  canInteract: boolean
  slashMenuOpen: boolean
  slashMatches: SlashCommandDefinition[]
  slashIndex: number
  isTaskRunning: boolean
  onSlashSelect: (command: SlashCommandDefinition) => void
  onSlashHover: (index: number) => void
  modelOptions: SelectOption[]
  effortOptions: SelectOption[]
  effectiveModel: string
  effectiveEffort: string
  onModelChange: (value: string) => void
  onEffortChange: (value: string) => void
  showModelSelect: boolean
  showEffortSelect: boolean
  queuedCount: number
  webSearchEnabled: boolean
  onWebSearchToggle: () => void
}

export const SessionComposer = ({
  inputValue,
  onInputChange,
  onKeyDown,
  onSend,
  textareaRef,
  canInteract,
  slashMenuOpen,
  slashMatches,
  slashIndex,
  isTaskRunning,
  onSlashSelect,
  onSlashHover,
  modelOptions,
  effortOptions,
  effectiveModel,
  effectiveEffort,
  onModelChange,
  onEffortChange,
  showModelSelect,
  showEffortSelect,
  queuedCount,
  webSearchEnabled,
  onWebSearchToggle,
}: SessionComposerProps) => {
  return (
    <div className="px-6 py-4 border-t border-border shrink-0">
      <div className="max-w-4xl mx-auto">
        <div className="bg-bg-tertiary border border-border rounded-xl overflow-visible focus-within:border-text-muted transition-colors relative">
          {slashMenuOpen && (
            <SlashCommandMenu
              commands={slashMatches}
              activeIndex={slashIndex}
              isTaskRunning={isTaskRunning}
              onSelect={onSlashSelect}
              onHover={onSlashHover}
            />
          )}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Describe a task... (Enter to send, Shift+Enter for new line)"
            rows={3}
            disabled={!canInteract}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none resize-none px-4 py-3 leading-relaxed disabled:opacity-50"
          />
          <div className="flex items-center justify-between px-2.5 py-2 border-t border-border bg-bg-secondary/50 rounded-b-xl">
            <div className="flex items-center gap-1">
              <IconButton icon={<Icons.Paperclip className="w-4 h-4 text-text-muted" />} size="sm" disabled={!canInteract} />
              <IconButton icon={<Icons.Microphone className="w-4 h-4 text-text-muted" />} size="sm" disabled={!canInteract} />
              <IconButton 
                icon={<Icons.Globe className={`w-4 h-4 ${webSearchEnabled ? 'text-accent-green' : 'text-text-muted'}`} />} 
                size="sm" 
                disabled={!canInteract}
                onClick={onWebSearchToggle}
              />
              {showModelSelect && (
                <Select
                  options={modelOptions}
                  value={effectiveModel}
                  onChange={onModelChange}
                  size="sm"
                  disabled={!canInteract}
                />
              )}
              {showEffortSelect && (
                <Select
                  options={effortOptions}
                  value={effectiveEffort}
                  onChange={onEffortChange}
                  placeholder="Thinking"
                  size="sm"
                  disabled={!canInteract}
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              {queuedCount > 0 && (
                <div className="text-[10px] text-text-muted">
                  Queued {queuedCount}
                </div>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={onSend}
                disabled={!inputValue.trim() || !canInteract}
              >
                <Icons.ArrowUp className="w-3.5 h-3.5" />
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
