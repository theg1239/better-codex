import type { ReactNode } from 'react'

interface SectionHeaderProps {
  children: ReactNode
}

export function SectionHeader({ children }: SectionHeaderProps) {
  return (
    <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider px-2 mb-2">
      {children}
    </h2>
  )
}
