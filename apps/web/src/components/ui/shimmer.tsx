import { useEffect, useState } from 'react'

interface ShimmerTextProps {
  text: string
  className?: string
}

export function ShimmerText({ text, className = '' }: ShimmerTextProps) {
  const [position, setPosition] = useState(0)
  const chars = text.split('')
  const padding = 10
  const period = chars.length + padding * 2
  const sweepDuration = 2000
  const bandHalfWidth = 5

  useEffect(() => {
    const startTime = Date.now()
    let animationFrame: number

    const animate = () => {
      const elapsed = (Date.now() - startTime) % sweepDuration
      const pos = (elapsed / sweepDuration) * period
      setPosition(pos)
      animationFrame = requestAnimationFrame(animate)
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [period, sweepDuration])

  return (
    <span className={className}>
      {chars.map((char, i) => {
        const iPos = i + padding
        const dist = Math.abs(iPos - position)
        
        const t = dist <= bandHalfWidth
          ? 0.5 * (1 + Math.cos(Math.PI * (dist / bandHalfWidth)))
          : 0
        
        const opacity = 0.4 + (t * 0.6)
        
        return (
          <span
            key={i}
            style={{
              opacity,
              fontWeight: t > 0.3 ? 600 : 400,
              transition: 'opacity 0.05s, font-weight 0.05s',
            }}
          >
            {char}
          </span>
        )
      })}
    </span>
  )
}

interface ShimmerDotsProps {
  className?: string
}

export function ShimmerDots({ className = '' }: ShimmerDotsProps) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % 4)
    }, 400)
    return () => clearInterval(interval)
  }, [])

  const dots = ['', '.', '..', '...']

  return (
    <span className={className}>
      <span className="inline-block w-[1.5em] text-left">{dots[frame]}</span>
    </span>
  )
}

interface ThinkingIndicatorProps {
  message?: string
  elapsed?: number
  className?: string
}

export function ThinkingIndicator({ 
  message = 'Thinking', 
  elapsed,
  className = '' 
}: ThinkingIndicatorProps) {
  const [elapsedTime, setElapsedTime] = useState(elapsed ?? 0)

  useEffect(() => {
    if (elapsed !== undefined) {
      setElapsedTime(elapsed)
      return
    }
    
    const start = Date.now()
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [elapsed])

  const formatElapsed = (secs: number) => {
    if (secs < 60) return `${secs}s`
    if (secs < 3600) {
      const m = Math.floor(secs / 60)
      const s = secs % 60
      return `${m}m ${s.toString().padStart(2, '0')}s`
    }
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
  }

  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      <ShimmerText text={message} className="text-text-primary" />
      <span className="text-text-muted">({formatElapsed(elapsedTime)})</span>
    </div>
  )
}

interface PulsingDotProps {
  className?: string
}

export function PulsingDot({ className = '' }: PulsingDotProps) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full bg-accent-green animate-pulse ${className}`} />
  )
}
