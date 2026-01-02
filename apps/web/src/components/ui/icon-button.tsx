import type { ReactNode } from 'react'

interface IconButtonProps {
  icon: ReactNode
  onClick?: () => void
  className?: string
  size?: 'sm' | 'md'
  disabled?: boolean
}

export function IconButton({
  icon,
  onClick,
  className = '',
  size = 'md',
  disabled = false,
}: IconButtonProps) {
  const sizeStyles = {
    sm: 'p-1.5',
    md: 'p-2',
  }
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg transition-colors ${sizeStyles[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-bg-hover'} ${className}`}
    >
      {icon}
    </button>
  )
}
