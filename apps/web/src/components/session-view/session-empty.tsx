import { Button, Icons } from '../ui'

interface SessionEmptyProps {
  onNewSession?: () => void
}

export const SessionEmpty = ({ onNewSession }: SessionEmptyProps) => {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 bg-bg-primary">
      <div className="w-14 h-14 rounded-2xl bg-accent-green flex items-center justify-center mb-5">
        <span className="text-black text-xl font-bold">C</span>
      </div>
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
