import type { ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
  fullWidth?: boolean
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  className = '',
  disabled = false,
  fullWidth = false,
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 font-medium transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed'

  const variantStyles = {
    primary: 'bg-accent-green text-black hover:bg-accent-green/90',
    secondary: 'bg-bg-elevated border border-border text-text-secondary hover:bg-bg-hover',
    ghost: 'text-text-muted hover:text-text-secondary hover:bg-bg-hover',
    danger: 'bg-accent-red text-white hover:bg-accent-red/90',
  }

  const sizeStyles = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-sm',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  )
}
