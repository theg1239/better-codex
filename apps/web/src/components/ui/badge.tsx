import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error'
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  const variantStyles = {
    default: 'bg-bg-elevated text-text-secondary border-border',
    success: 'bg-accent-green/15 text-accent-green border-accent-green/20',
    warning: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20',
    error: 'bg-accent-red/15 text-accent-red border-accent-red/20',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${variantStyles[variant]}`}>
      {children}
    </span>
  )
}
