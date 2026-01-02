import { useEffect, useState } from 'react'
import { Button, Icons } from '../ui'
import { STARTUP_FRAMES, STARTUP_FRAME_TICK_MS } from '../loading/startup-ascii'

interface SessionEmptyProps {
  onNewSession?: () => void
}

export const SessionEmpty = ({ onNewSession }: SessionEmptyProps) => {
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % STARTUP_FRAMES.length)
    }, STARTUP_FRAME_TICK_MS)
    return () => window.clearInterval(intervalId)
  }, [])

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 bg-bg-primary">
      <pre className="whitespace-pre font-mono text-[11px] leading-tight text-text-secondary mb-5">
        {STARTUP_FRAMES[frameIndex]}
      </pre>
      <h2 className="text-lg font-semibold text-text-primary mb-2">Select a session</h2>
      <p className="text-xs text-text-muted text-center max-w-xs mb-5 leading-relaxed">
        Choose a session from the list to view the conversation, or start a new one to begin coding.
      </p>
      <Button variant="primary" size="lg" onClick={onNewSession}>
        <Icons.Plus className="w-4 h-4" />
        New Session
      </Button>
    </main>
  )
}
