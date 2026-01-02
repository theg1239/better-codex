export type SlashCommandId =
  | 'model'
  | 'summary'
  | 'cwd'
  | 'approvals'
  | 'skills'
  | 'review'
  | 'new'
  | 'resume'
  | 'init'
  | 'compact'
  | 'diff'
  | 'mention'
  | 'status'
  | 'mcp'
  | 'experimental'
  | 'logout'
  | 'quit'
  | 'exit'
  | 'feedback'

export type SlashCommandDefinition = {
  id: SlashCommandId
  description: string
  availableDuringTask: boolean
}

export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  { id: 'model', description: 'choose what model and reasoning effort to use', availableDuringTask: false },
  { id: 'summary', description: 'set reasoning summary length', availableDuringTask: false },
  { id: 'cwd', description: 'set working directory for the thread', availableDuringTask: false },
  { id: 'approvals', description: 'choose what Codex can do without approval', availableDuringTask: false },
  { id: 'skills', description: 'browse and insert skills', availableDuringTask: true },
  { id: 'review', description: 'review my current changes and find issues', availableDuringTask: false },
  { id: 'new', description: 'start a new chat during a conversation', availableDuringTask: false },
  { id: 'resume', description: 'resume a saved chat', availableDuringTask: false },
  { id: 'init', description: 'create an AGENTS.md file with instructions for Codex', availableDuringTask: false },
  { id: 'compact', description: 'summarize conversation to prevent hitting the context limit', availableDuringTask: false },
  { id: 'diff', description: 'show git diff (including untracked files)', availableDuringTask: true },
  { id: 'mention', description: 'mention a file', availableDuringTask: true },
  { id: 'status', description: 'show current session configuration and token usage', availableDuringTask: true },
  { id: 'mcp', description: 'list configured MCP tools', availableDuringTask: true },
  { id: 'experimental', description: 'open experimental menu', availableDuringTask: true },
  { id: 'logout', description: 'log out of Codex', availableDuringTask: false },
  { id: 'quit', description: 'exit Codex', availableDuringTask: true },
  { id: 'exit', description: 'exit Codex', availableDuringTask: true },
  { id: 'feedback', description: 'send logs to maintainers', availableDuringTask: true },
]

export const filterSlashCommands = (query: string) => {
  if (!query) {
    return SLASH_COMMANDS
  }
  const lowered = query.toLowerCase()
  return SLASH_COMMANDS.filter((command) => command.id.startsWith(lowered))
}

export const findSlashCommand = (name: string) =>
  SLASH_COMMANDS.find((command) => command.id === name)

export const getSlashQuery = (text: string): string | null => {
  const firstLine = text.split('\n')[0] ?? ''
  if (!firstLine.startsWith('/')) {
    return null
  }
  if (firstLine.startsWith('/ ') || firstLine.startsWith('/\t')) {
    return null
  }
  const raw = firstLine.slice(1)
  const token = raw.split(/\s/)[0]
  return token
}

export const parseSlashInput = (text: string): { name: string; rest: string } | null => {
  const firstLine = text.split('\n')[0] ?? ''
  if (!firstLine.startsWith('/')) {
    return null
  }
  if (firstLine.startsWith('/ ') || firstLine.startsWith('/\t')) {
    return null
  }
  const raw = firstLine.slice(1)
  if (!raw) {
    return { name: '', rest: '' }
  }
  const match = raw.match(/^([^\s]+)\s*(.*)$/)
  if (!match) {
    return null
  }
  const name = match[1]
  const rest = match[2] ?? ''
  if (!name || name.includes('/')) {
    return null
  }
  return { name, rest: rest.trim() }
}
