import { useState, useRef, useEffect } from 'react'
import { Icons } from './icons'

interface CollapsibleContentProps {
  children: React.ReactNode
  maxHeight?: number
  className?: string
  showLineCount?: boolean
}

export function CollapsibleContent({ 
  children, 
  maxHeight = 200, 
  className = '',
  showLineCount = true,
}: CollapsibleContentProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [needsCollapse, setNeedsCollapse] = useState(false)
  const [lineCount, setLineCount] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contentRef.current) {
      const height = contentRef.current.scrollHeight
      setNeedsCollapse(height > maxHeight)
      
      const text = contentRef.current.textContent || ''
      const lines = text.split('\n').length
      setLineCount(lines)
    }
  }, [children, maxHeight])

  if (!needsCollapse) {
    return <div className={className}>{children}</div>
  }

  return (
    <div className={className}>
      <div
        ref={contentRef}
        className="relative overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: isExpanded ? 'none' : maxHeight }}
      >
        {children}
        {!isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-bg-tertiary to-transparent pointer-events-none" />
        )}
      </div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 mt-2 text-xs text-text-muted hover:text-text-primary transition-colors group"
      >
        <Icons.ChevronDown 
          className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
        <span>
          {isExpanded ? 'Collapse' : 'Expand'}
          {showLineCount && lineCount > 0 && (
            <span className="text-text-muted/60 ml-1">({lineCount} lines)</span>
          )}
        </span>
      </button>
    </div>
  )
}

interface CollapsibleCodeBlockProps {
  code: string
  language?: string
  maxLines?: number
  className?: string
}

export function CollapsibleCodeBlock({ 
  code, 
  language,
  maxLines = 15,
  className = '',
}: CollapsibleCodeBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const lines = code.split('\n')
  const needsCollapse = lines.length > maxLines
  const visibleCode = needsCollapse && !isExpanded 
    ? lines.slice(0, maxLines).join('\n')
    : code

  return (
    <div className={className}>
      <div className="relative">
        <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed break-words overflow-wrap-anywhere">
          <code className={language ? `language-${language}` : ''}>
            {visibleCode}
          </code>
        </pre>
        {needsCollapse && !isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-bg-primary to-transparent pointer-events-none" />
        )}
      </div>
      {needsCollapse && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 mt-2 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <Icons.ChevronDown 
            className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
          <span>
            {isExpanded ? 'Show less' : `Show ${lines.length - maxLines} more lines`}
          </span>
        </button>
      )}
    </div>
  )
}
