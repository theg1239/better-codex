import type { ReactNode } from 'react'

interface InputProps {
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  className?: string
  icon?: ReactNode
}

export function Input({
  placeholder,
  value,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  className = '',
  icon,
}: InputProps) {
  return (
    <div className={`relative ${className}`}>
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
          {icon}
        </div>
      )}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={`w-full bg-bg-tertiary border border-border rounded-lg py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors ${icon ? 'pl-10 pr-4' : 'px-4'}`}
      />
    </div>
  )
}
