import { useEffect, useState } from 'react'
import { Button, Icons } from '../ui'
import { STARTUP_FRAMES, STARTUP_FRAME_TICK_MS } from '../loading/startup-ascii'
import { useAppStore } from '../../store'

interface SessionEmptyProps {
  onNewSession?: () => void
}

export const SessionEmpty = ({ onNewSession }: SessionEmptyProps) => {
  const [frameIndex, setFrameIndex] = useState(0)
  const { setMobileThreadListOpen } = useAppStore()

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % STARTUP_FRAMES.length)
    }, STARTUP_FRAME_TICK_MS)
    return () => window.clearInterval(intervalId)
  }, [])

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 bg-bg-primary">
      <pre className="whitespace-pre font-mono text-[9px] sm:text-[11px] leading-tight text-text-secondary mb-5 overflow-hidden max-w-full">
        {STARTUP_FRAMES[frameIndex]}
      </pre>
      <h2 className="text-base sm:text-lg font-semibold text-text-primary mb-2 text-center">Select a session</h2>
      <p className="text-xs text-text-muted text-center max-w-xs mb-5 leading-relaxed">
        Choose a session from the list to view the conversation, or start a new one to begin coding.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button 
          variant="ghost" 
          size="lg" 
          onClick={() => setMobileThreadListOpen(true)}
          className="md:hidden"
        >
          <Icons.List className="w-4 h-4" />
          View Sessions
        </Button>
        <Button variant="primary" size="lg" onClick={onNewSession}>
          <Icons.Plus className="w-4 h-4" />
          New Session
        </Button>
      </div>
    </main>
  )
}
