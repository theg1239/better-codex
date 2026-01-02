import { useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import { STARTUP_FRAMES, STARTUP_FRAME_TICK_MS } from './startup-ascii'

export const StartupLoader = () => {
  const connectionStatus = useAppStore((state) => state.connectionStatus)
  const isLoading = connectionStatus === 'idle' || connectionStatus === 'connecting'
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    if (!isLoading) {
      return undefined
    }
    setFrameIndex(0)
    const intervalId = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % STARTUP_FRAMES.length)
    }, STARTUP_FRAME_TICK_MS)
    return () => window.clearInterval(intervalId)
  }, [isLoading])

  if (!isLoading) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary">
      <div className="flex flex-col items-center gap-6 text-center">
        <pre className="whitespace-pre font-mono text-[11px] leading-tight text-text-secondary">
          {STARTUP_FRAMES[frameIndex]}
        </pre>
        <div className="text-xs uppercase tracking-[0.4em] text-text-muted">
          Booting Codex Hub
        </div>
      </div>
    </div>
  )
}
