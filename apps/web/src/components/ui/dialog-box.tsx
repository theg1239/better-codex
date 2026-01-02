import { useEffect, useRef, type ReactNode } from 'react'
import { Icons } from './icons'
import { Button } from './button'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'small' | 'medium' | 'large'
}

export function Dialog({ open, onClose, title, children, size = 'medium' }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const sizeClasses = {
    small: 'max-w-md',
    medium: 'max-w-lg',
    large: 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className={`relative bg-bg-secondary border border-border rounded-xl shadow-2xl w-full ${sizeClasses[size]} mx-4 overflow-visible`}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-bg-hover transition-colors"
            >
              <Icons.X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        )}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-1 rounded-md hover:bg-bg-hover transition-colors"
          >
            <Icons.X className="w-4 h-4 text-text-muted" />
          </button>
        )}

        <div className={title ? 'p-4' : ''}>{children}</div>
      </div>
    </div>
  )
}

interface AlertDialogProps {
  open: boolean
  onClose: () => void
  title: string
  message: string
  variant?: 'info' | 'warning' | 'error'
}

export function AlertDialog({ open, onClose, title, message, variant = 'info' }: AlertDialogProps) {
  const iconColors = {
    info: 'text-accent-blue bg-accent-blue/10',
    warning: 'text-yellow-500 bg-yellow-500/10',
    error: 'text-accent-red bg-accent-red/10',
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex gap-3">
        <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${iconColors[variant]}`}>
          <Icons.Warning className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-text-secondary leading-relaxed mb-4">{message}</p>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={onClose}>
              OK
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

interface PromptDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (value: string) => void
  title: string
  placeholder?: string
  submitLabel?: string
  defaultValue?: string
}

export function PromptDialog({
  open,
  onClose,
  onSubmit,
  title,
  placeholder = '',
  submitLabel = 'Submit',
  defaultValue = '',
}: PromptDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.value = defaultValue
    }
  }, [open, defaultValue])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = inputRef.current?.value.trim()
    if (value) {
      onSubmit(value)
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors mb-4"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

interface CopyDialogProps {
  open: boolean
  onClose: () => void
  title: string
  message: string
  copyText: string
}

export function CopyDialog({ open, onClose, title, message, copyText }: CopyDialogProps) {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyText)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm text-text-secondary leading-relaxed mb-3">{message}</p>
      <div className="bg-bg-primary border border-border rounded-lg p-3 mb-4">
        <code className="text-xs text-accent-blue break-all">{copyText}</code>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button variant="primary" size="sm" onClick={handleCopy}>
          <Icons.Copy className="w-3.5 h-3.5" />
          Copy URL
        </Button>
      </div>
    </Dialog>
  )
}
