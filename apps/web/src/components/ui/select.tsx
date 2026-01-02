import { useState, useRef, useEffect } from 'react'
import { Icons } from './icons'

export interface SelectOption {
  value: string
  label: string
  description?: string
}

interface SelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  size = 'md',
  className = '',
  disabled = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const sizeStyles = {
    sm: 'px-2 py-1 text-[11px]',
    md: 'px-3 py-1.5 text-xs',
  }

  const dropdownSizeStyles = {
    sm: 'text-[11px]',
    md: 'text-xs',
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1.5 bg-bg-tertiary border border-border rounded-lg ${sizeStyles[size]} text-text-secondary hover:bg-bg-hover hover:border-text-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-0`}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <Icons.ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-max min-w-full max-w-[280px] bg-bg-secondary border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="max-h-[200px] overflow-y-auto py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`w-full text-left px-3 py-2 hover:bg-bg-hover transition-colors ${dropdownSizeStyles[size]} ${
                  option.value === value ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary'
                }`}
              >
                <div className="font-medium truncate">{option.label}</div>
                {option.description && (
                  <div className="text-[10px] text-text-muted truncate mt-0.5">{option.description}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
