import { useEffect, type ReactNode } from 'react'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  side?: 'left' | 'right'
  className?: string
}

export function MobileDrawer({ 
  open, 
  onClose, 
  children, 
  side = 'left',
  className = '' 
}: MobileDrawerProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [open])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  const translateClass = side === 'left' 
    ? open ? 'translate-x-0' : '-translate-x-full'
    : open ? 'translate-x-0' : 'translate-x-full'

  const positionClass = side === 'left' ? 'left-0' : 'right-0'

  return (
    <>
      <div 
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-mobile transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      
      <div 
        className={`fixed top-0 ${positionClass} z-50 w-[280px] max-w-[85vw] bg-bg-secondary border-r border-border transform transition-transform duration-300 ease-out ${translateClass} ${className}`}
        style={{ height: 'calc(var(--vh, 1vh) * 100)' }}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </>
  )
}

interface MobileSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

export function MobileSheet({ 
  open, 
  onClose, 
  children,
  className = '' 
}: MobileSheetProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [open])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  return (
    <>
      <div 
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-mobile transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      
      <div 
        className={`fixed inset-x-0 bottom-0 z-50 bg-bg-secondary border-t border-border rounded-t-2xl transform transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        } ${className}`}
        style={{ maxHeight: 'calc(var(--vh, 1vh) * 85)' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>
        <div className="overflow-y-auto touch-scroll pb-safe">
          {children}
        </div>
      </div>
    </>
  )
}
