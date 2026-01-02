import { Streamdown } from 'streamdown'

interface MarkdownProps {
  content: string
  className?: string
  streaming?: boolean
}

export function Markdown({ content, className = '', streaming = false }: MarkdownProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <Streamdown
        mode={streaming ? 'streaming' : 'static'}
        controls={false}
        shikiTheme={['tokyo-night', 'tokyo-night']}
      >
        {content}
      </Streamdown>
    </div>
  )
}
