type ParsedArgs = {
  positional: string[]
  named: Record<string, string>
}

const tokenizeArgs = (input: string): string[] => {
  if (!input.trim()) {
    return []
  }
  const tokens: string[] = []
  const regex = /"([^"]*)"|'([^']*)'|([^\s]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  return tokens
}

const parseArgs = (input: string): ParsedArgs => {
  const tokens = tokenizeArgs(input)
  const positional: string[] = []
  const named: Record<string, string> = {}

  tokens.forEach((token) => {
    const eqIndex = token.indexOf('=')
    if (eqIndex > 0) {
      const key = token.slice(0, eqIndex)
      const value = token.slice(eqIndex + 1)
      named[key] = value
    } else {
      positional.push(token)
    }
  })

  return { positional, named }
}

export const stripPromptFrontmatter = (input: string): string => {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith('---')) {
    return input
  }
  const end = trimmed.indexOf('\n---', 3)
  if (end === -1) {
    return input
  }
  const after = trimmed.slice(end + 4)
  return after.startsWith('\n') ? after.slice(1) : after
}

export const expandPromptTemplate = (template: string, args: string): string => {
  const { positional, named } = parseArgs(args)
  const placeholder = '__CODEX_DOLLAR__'
  let output = template.replace(/\$\$/g, placeholder)

  output = output.replace(/\$ARGUMENTS/g, positional.join(' '))
  output = output.replace(/\$(\d)/g, (_, digit) => positional[Number(digit) - 1] ?? '')
  output = output.replace(/\$([A-Z][A-Z0-9_]*)/g, (_, key) => named[key] ?? '')

  output = output.replace(new RegExp(placeholder, 'g'), '$')
  return output
}
