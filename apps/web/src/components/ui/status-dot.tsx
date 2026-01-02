interface StatusDotProps {
  status: 'online' | 'degraded' | 'offline' | 'active' | 'idle'
  size?: 'sm' | 'md'
  pulse?: boolean
}

export function StatusDot({ status, size = 'sm', pulse = false }: StatusDotProps) {
  const colorMap = {
    online: 'bg-accent-green',
    active: 'bg-accent-green',
    degraded: 'bg-yellow-500',
    offline: 'bg-text-muted',
    idle: 'bg-text-muted',
  }

  const sizeStyles = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
  }

  return (
    <span className={`rounded-full ${colorMap[status]} ${sizeStyles[size]} ${pulse ? 'animate-pulse' : ''}`} />
  )
}
