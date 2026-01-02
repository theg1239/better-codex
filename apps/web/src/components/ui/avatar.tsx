interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ name, size = 'md', className = '' }: AvatarProps) {
  const sizeStyles = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  }

  return (
    <div className={`rounded-full bg-bg-tertiary flex items-center justify-center font-medium text-text-primary ${sizeStyles[size]} ${className}`}>
      {name[0].toUpperCase()}
    </div>
  )
}
