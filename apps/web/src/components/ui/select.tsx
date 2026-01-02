import { useState, useRef, useEffect } from 'react'
import { Icons } from './icons'
import { MobileSheet } from './mobile-drawer'
import { useIsMobile } from '../../hooks/use-mobile'

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
  label?: string
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  size = 'md',
  className = '',
  disabled = false,
  label,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const selectedOption = options.find((opt) => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen && !isMobile) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, isMobile])

  const sizeStyles = {
    sm: 'px-2 py-1 text-[11px]',
    md: 'px-3 py-1.5 text-xs',
  }

  const dropdownSizeStyles = {
    sm: 'text-[11px]',
    md: 'text-xs',
  }

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
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

      {!isMobile && isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-max min-w-full max-w-[280px] bg-bg-secondary border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="max-h-[200px] overflow-y-auto py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
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

      {isMobile && (
        <MobileSheet open={isOpen} onClose={() => setIsOpen(false)}>
          <div className="px-4 pb-4">
            {label && (
              <h3 className="text-sm font-semibold text-text-primary mb-3">{label}</h3>
            )}
            {!label && placeholder && (
              <h3 className="text-sm font-semibold text-text-primary mb-3">{placeholder}</h3>
            )}
            <div className="space-y-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    option.value === value 
                      ? 'bg-accent-green/10 border border-accent-green/30' 
                      : 'bg-bg-tertiary border border-border hover:bg-bg-hover'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium truncate ${option.value === value ? 'text-accent-green' : 'text-text-primary'}`}>
                        {option.label}
                      </div>
                      {option.description && (
                        <div className="text-xs text-text-muted truncate mt-0.5">{option.description}</div>
                      )}
                    </div>
                    {option.value === value && (
                      <Icons.Check className="w-4 h-4 text-accent-green shrink-0 ml-2" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </MobileSheet>
      )}
    </div>
  )
}
