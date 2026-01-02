import type { KeyboardEvent, RefObject, ClipboardEvent, DragEvent } from 'react'
import { useRef } from 'react'
import { SlashCommandMenu } from '../composer/slash-command-menu'
import { FileMentionMenu } from './file-mention-menu'
import { Button, IconButton, Icons, Select, type SelectOption } from '../ui'
import type { SlashCommandDefinition } from '../../utils/slash-commands'
import type { Attachment, FileMention } from '../../types'

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
  attachments: Attachment[]
  onAttachmentsChange: (attachments: Attachment[]) => void
  fileMentions: FileMention[]
  onFileMentionsChange: (mentions: FileMention[]) => void
  mentionMenuOpen: boolean
  mentionQuery: string
  mentionMatches: FileMention[]
  mentionIndex: number
  onMentionSelect: (mention: FileMention) => void
  onMentionHover: (index: number) => void
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
  attachments,
  onAttachmentsChange,
  fileMentions,
  onFileMentionsChange,
  mentionMenuOpen,
  mentionQuery,
  mentionMatches,
  mentionIndex,
  onMentionSelect,
  onMentionHover,
}: SessionComposerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string
            const newAttachment: Attachment = {
              id: `img-${Date.now()}`,
              type: 'image',
              name: `pasted-image-${Date.now()}.png`,
              url: dataUrl,
              size: file.size,
            }
            onAttachmentsChange([...attachments, newAttachment])
          }
          reader.readAsDataURL(file)
        }
        return
      }
    }
  }

  const handleDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files) return

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string
          const newAttachment: Attachment = {
            id: `img-${Date.now()}`,
            type: 'image',
            name: file.name,
            url: dataUrl,
            size: file.size,
          }
          onAttachmentsChange([...attachments, newAttachment])
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string
          const newAttachment: Attachment = {
            id: `img-${Date.now()}`,
            type: 'image',
            name: file.name,
            url: dataUrl,
            size: file.size,
          }
          onAttachmentsChange([...attachments, newAttachment])
        }
        reader.readAsDataURL(file)
      }
    }
    // Reset input
    e.target.value = ''
  }

  const removeAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter(a => a.id !== id))
  }

  const removeMention = (path: string) => {
    onFileMentionsChange(fileMentions.filter(m => m.path !== path))
  }

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
          {mentionMenuOpen && mentionMatches.length > 0 && (
            <FileMentionMenu
              matches={mentionMatches}
              activeIndex={mentionIndex}
              query={mentionQuery}
              onSelect={onMentionSelect}
              onHover={onMentionHover}
            />
          )}
          
          {/* Attachments preview */}
          {(attachments.length > 0 || fileMentions.length > 0) && (
            <div className="px-4 pt-3 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div 
                  key={attachment.id} 
                  className="relative group flex items-center gap-2 px-2 py-1 bg-bg-elevated border border-border rounded-lg"
                >
                  {attachment.type === 'image' && attachment.url && (
                    <img 
                      src={attachment.url} 
                      alt={attachment.name} 
                      className="w-8 h-8 object-cover rounded"
                    />
                  )}
                  <span className="text-[10px] text-text-secondary max-w-[100px] truncate">
                    {attachment.name}
                  </span>
                  <button
                    onClick={() => removeAttachment(attachment.id)}
                    className="p-0.5 hover:bg-bg-hover rounded transition-colors"
                  >
                    <Icons.X className="w-3 h-3 text-text-muted" />
                  </button>
                </div>
              ))}
              {fileMentions.map((mention) => (
                <div 
                  key={mention.path} 
                  className="flex items-center gap-1.5 px-2 py-1 bg-accent-blue/10 border border-accent-blue/30 rounded-lg"
                >
                  <Icons.File className="w-3 h-3 text-accent-blue" />
                  <span className="text-[10px] text-accent-blue max-w-[150px] truncate">
                    {mention.name}
                  </span>
                  <button
                    onClick={() => removeMention(mention.path)}
                    className="p-0.5 hover:bg-accent-blue/20 rounded transition-colors"
                  >
                    <Icons.X className="w-3 h-3 text-accent-blue" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            placeholder="Describe a task... (@ to mention files, Enter to send)"
            rows={3}
            disabled={!canInteract}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none resize-none px-4 py-3 leading-relaxed disabled:opacity-50"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />
          <div className="flex items-center justify-between px-2.5 py-2 border-t border-border bg-bg-secondary/50 rounded-b-xl">
            <div className="flex items-center gap-1">
              <IconButton 
                icon={<Icons.Paperclip className="w-4 h-4 text-text-muted" />} 
                size="sm" 
                disabled={!canInteract}
                onClick={() => fileInputRef.current?.click()}
              />
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
