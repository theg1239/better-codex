import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type McpServerConfig = {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  env_vars?: string[]
  cwd?: string
  url?: string
  bearer_token_env_var?: string
  http_headers?: Record<string, string>
  env_http_headers?: Record<string, string>
  enabled?: boolean
  startup_timeout_sec?: number
  startup_timeout_ms?: number
  tool_timeout_sec?: number
  enabled_tools?: string[]
  disabled_tools?: string[]
}

export type ProfileConfigSnapshot = {
  path: string
  content: string
  mcpServers: McpServerConfig[]
}

const CONFIG_FILENAME = 'config.toml'

const getConfigPath = (codexHome: string) => join(codexHome, CONFIG_FILENAME)

const stripInlineComment = (value: string) => {
  let inSingle = false
  let inDouble = false
  let escaped = false
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && inDouble) {
      escaped = true
      continue
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (char === '#' && !inSingle && !inDouble) {
      return value.slice(0, i)
    }
  }
  return value
}

const parseTomlString = (value: string) => {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const unquoted = trimmed.slice(1, -1)
    return unquoted.replace(/\\(["\\])/g, '$1')
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

const parseTomlPrimitive = (value: string): string | number | boolean => {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return parseTomlString(trimmed)
  }
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }
  return trimmed
}

const parseTomlArray = (value: string): string[] => {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return []
  }
  const inner = trimmed.slice(1, -1)
  const items: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let escaped = false
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i]
    if (escaped) {
      escaped = false
      current += char
      continue
    }
    if (char === '\\' && inDouble) {
      escaped = true
      current += char
      continue
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      current += char
      continue
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      current += char
      continue
    }
    if (char === ',' && !inSingle && !inDouble) {
      const cleaned = current.trim()
      if (cleaned) {
        items.push(String(parseTomlPrimitive(cleaned)))
      }
      current = ''
      continue
    }
    current += char
  }
  const last = current.trim()
  if (last) {
    items.push(String(parseTomlPrimitive(last)))
  }
  return items
}

type TomlValue = string | number | boolean | string[] | Record<string, string>

const parseTomlInlineTable = (value: string): Record<string, string> => {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return {}
  }
  const inner = trimmed.slice(1, -1).trim()
  if (!inner) {
    return {}
  }
  const entries: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let escaped = false
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i]
    if (escaped) {
      escaped = false
      current += char
      continue
    }
    if (char === '\\' && inDouble) {
      escaped = true
      current += char
      continue
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      current += char
      continue
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      current += char
      continue
    }
    if (char === ',' && !inSingle && !inDouble) {
      const cleaned = current.trim()
      if (cleaned) {
        entries.push(cleaned)
      }
      current = ''
      continue
    }
    current += char
  }
  const tail = current.trim()
  if (tail) {
    entries.push(tail)
  }

  const table: Record<string, string> = {}
  entries.forEach((entry) => {
    const eqIndex = entry.indexOf('=')
    if (eqIndex <= 0) {
      return
    }
    const rawKey = entry.slice(0, eqIndex).trim()
    const rawValue = entry.slice(eqIndex + 1).trim()
    if (!rawKey) {
      return
    }
    const key = parseTomlString(rawKey)
    const valueParsed = parseTomlPrimitive(rawValue)
    table[key] = String(valueParsed)
  })

  return table
}

const parseTomlValue = (rawValue: string): TomlValue => {
  const cleaned = stripInlineComment(rawValue).trim()
  if (!cleaned) {
    return ''
  }
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    return parseTomlArray(cleaned)
  }
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    return parseTomlInlineTable(cleaned)
  }
  return parseTomlPrimitive(cleaned)
}

const parseAssignment = (line: string): { key: string; value: ReturnType<typeof parseTomlValue> } | null => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return null
  }
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex <= 0) {
    return null
  }
  const key = trimmed.slice(0, eqIndex).trim()
  const rawValue = trimmed.slice(eqIndex + 1).trim()
  if (!key) {
    return null
  }
  return { key, value: parseTomlValue(rawValue) }
}

const parseMcpServers = (content: string): McpServerConfig[] => {
  const servers = new Map<string, McpServerConfig>()
  const lines = content.split(/\r?\n/)
  if (lines.length === 1 && !lines[0]?.trim()) {
    lines.length = 0
  }
  let currentTable: string | null = null

  for (const line of lines) {
    const headerMatch = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (headerMatch) {
      currentTable = headerMatch[1]?.trim() ?? null
      continue
    }
    if (!currentTable || !currentTable.startsWith('mcp_servers.')) {
      continue
    }
    const pathParts = currentTable.split('.')
    if (pathParts.length < 2) {
      continue
    }
    const serverName = pathParts[1]
    const subTable = pathParts.slice(2).join('.')
    if (!serverName) {
      continue
    }
    const assignment = parseAssignment(line)
    if (!assignment) {
      continue
    }
    const server = servers.get(serverName) ?? { name: serverName }
    if (subTable === 'env') {
      server.env = server.env ?? {}
      server.env[assignment.key] = String(assignment.value)
      servers.set(serverName, server)
      continue
    }
    if (subTable === 'http_headers') {
      server.http_headers = server.http_headers ?? {}
      server.http_headers[assignment.key] = String(assignment.value)
      servers.set(serverName, server)
      continue
    }
    if (subTable === 'env_http_headers') {
      server.env_http_headers = server.env_http_headers ?? {}
      server.env_http_headers[assignment.key] = String(assignment.value)
      servers.set(serverName, server)
      continue
    }
    switch (assignment.key) {
      case 'command':
        server.command = String(assignment.value)
        break
      case 'args':
        server.args = Array.isArray(assignment.value) ? assignment.value : [String(assignment.value)]
        break
      case 'env':
        if (assignment.value && typeof assignment.value === 'object' && !Array.isArray(assignment.value)) {
          server.env = { ...(server.env ?? {}), ...(assignment.value as Record<string, string>) }
        }
        break
      case 'env_vars':
        server.env_vars = Array.isArray(assignment.value) ? assignment.value : [String(assignment.value)]
        break
      case 'cwd':
        server.cwd = String(assignment.value)
        break
      case 'url':
        server.url = String(assignment.value)
        break
      case 'bearer_token_env_var':
        server.bearer_token_env_var = String(assignment.value)
        break
      case 'http_headers':
        if (assignment.value && typeof assignment.value === 'object' && !Array.isArray(assignment.value)) {
          server.http_headers = assignment.value as Record<string, string>
        }
        break
      case 'env_http_headers':
        if (assignment.value && typeof assignment.value === 'object' && !Array.isArray(assignment.value)) {
          server.env_http_headers = assignment.value as Record<string, string>
        }
        break
      case 'enabled':
        if (typeof assignment.value === 'boolean') {
          server.enabled = assignment.value
        } else if (typeof assignment.value === 'string') {
          server.enabled = assignment.value === 'true'
        } else {
          server.enabled = Boolean(assignment.value)
        }
        break
      case 'startup_timeout_sec':
        {
          const parsed = Number(assignment.value)
          if (Number.isFinite(parsed)) {
            server.startup_timeout_sec = parsed
          }
        }
        break
      case 'startup_timeout_ms':
        {
          const parsed = Number(assignment.value)
          if (Number.isFinite(parsed)) {
            server.startup_timeout_ms = parsed
          }
        }
        break
      case 'tool_timeout_sec':
        {
          const parsed = Number(assignment.value)
          if (Number.isFinite(parsed)) {
            server.tool_timeout_sec = parsed
          }
        }
        break
      case 'enabled_tools':
        server.enabled_tools = Array.isArray(assignment.value) ? assignment.value : [String(assignment.value)]
        break
      case 'disabled_tools':
        server.disabled_tools = Array.isArray(assignment.value) ? assignment.value : [String(assignment.value)]
        break
      default:
        break
    }
    servers.set(serverName, server)
  }

  return [...servers.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const formatTomlString = (value: string) => {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

const formatInlineTable = (value: Record<string, string>) => {
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
  const rendered = entries
    .map(([key, entryValue]) => `${formatTomlString(key)} = ${formatTomlString(entryValue)}`)
    .join(', ')
  return `{ ${rendered} }`
}

const formatTomlValue = (value: string | number | boolean | string[] | Record<string, string>) => {
  if (Array.isArray(value)) {
    const rendered = value.map((item) => formatTomlString(String(item))).join(', ')
    return `[${rendered}]`
  }
  if (value && typeof value === 'object') {
    return formatInlineTable(value)
  }
  if (typeof value === 'string') {
    return formatTomlString(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return Number.isFinite(value) ? String(value) : formatTomlString(String(value))
}

const buildMcpBlock = (servers: McpServerConfig[]): string[] => {
  if (!servers.length) {
    return []
  }
  const ordered = [...servers].sort((a, b) => a.name.localeCompare(b.name))
  const lines: string[] = []
  ordered.forEach((server, index) => {
    if (index > 0) {
      lines.push('')
    }
    lines.push(`[mcp_servers.${server.name}]`)
    const entries: Array<[string, string | number | boolean | string[] | Record<string, string>]> = []
    if (server.command) entries.push(['command', server.command])
    if (server.args && server.args.length) entries.push(['args', server.args])
    if (server.url) entries.push(['url', server.url])
    if (server.bearer_token_env_var) entries.push(['bearer_token_env_var', server.bearer_token_env_var])
    if (server.http_headers && Object.keys(server.http_headers).length > 0) {
      entries.push(['http_headers', server.http_headers])
    }
    if (server.env_http_headers && Object.keys(server.env_http_headers).length > 0) {
      entries.push(['env_http_headers', server.env_http_headers])
    }
    if (typeof server.enabled === 'boolean') entries.push(['enabled', server.enabled])
    if (typeof server.startup_timeout_sec === 'number') entries.push(['startup_timeout_sec', server.startup_timeout_sec])
    if (typeof server.startup_timeout_ms === 'number') entries.push(['startup_timeout_ms', server.startup_timeout_ms])
    if (typeof server.tool_timeout_sec === 'number') entries.push(['tool_timeout_sec', server.tool_timeout_sec])
    if (server.enabled_tools && server.enabled_tools.length) entries.push(['enabled_tools', server.enabled_tools])
    if (server.disabled_tools && server.disabled_tools.length) entries.push(['disabled_tools', server.disabled_tools])
    if (server.env_vars && server.env_vars.length) entries.push(['env_vars', server.env_vars])
    if (server.cwd) entries.push(['cwd', server.cwd])
    entries.forEach(([key, value]) => {
      lines.push(`${key} = ${formatTomlValue(value)}`)
    })
    if (server.env && Object.keys(server.env).length > 0) {
      lines.push('')
      lines.push(`[mcp_servers.${server.name}.env]`)
      const envEntries = Object.entries(server.env).sort(([a], [b]) => a.localeCompare(b))
      envEntries.forEach(([key, value]) => {
        lines.push(`${key} = ${formatTomlValue(value)}`)
      })
    }
  })
  return lines
}

const isMcpTable = (table: string) => table === 'mcp_servers' || table.startsWith('mcp_servers.')

const replaceMcpBlock = (content: string, blockLines: string[]): string => {
  const lines = content.split(/\r?\n/)
  const ranges: Array<{ start: number; end: number }> = []
  let activeStart: number | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i]?.match(/^\s*\[([^\]]+)\]\s*$/)
    if (!match) {
      continue
    }
    const table = match[1]?.trim() ?? ''
    const isMcp = isMcpTable(table)
    if (isMcp && activeStart === null) {
      activeStart = i
      continue
    }
    if (!isMcp && activeStart !== null) {
      ranges.push({ start: activeStart, end: i })
      activeStart = null
    }
  }

  if (activeStart !== null) {
    ranges.push({ start: activeStart, end: lines.length })
  }

  const insertBlock = (target: string[], hasMoreContent: boolean) => {
    if (!blockLines.length) {
      return
    }
    if (target.length && target[target.length - 1]?.trim()) {
      target.push('')
    }
    target.push(...blockLines)
    if (hasMoreContent && blockLines[blockLines.length - 1]?.trim()) {
      target.push('')
    }
  }

  if (!ranges.length) {
    const updated: string[] = [...lines]
    insertBlock(updated, false)
    return updated.join('\n')
  }

  const updated: string[] = []
  let cursor = 0
  let inserted = false
  ranges.forEach((range, index) => {
    updated.push(...lines.slice(cursor, range.start))
    cursor = range.end
    if (!inserted) {
      insertBlock(updated, cursor < lines.length)
      inserted = true
    }
    if (index === ranges.length - 1 && cursor < lines.length) {
      updated.push(...lines.slice(cursor))
    }
  })

  if (!inserted) {
    insertBlock(updated, false)
  }

  return updated.join('\n')
}

const readConfigFile = async (configPath: string): Promise<string> => {
  try {
    return await readFile(configPath, 'utf8')
  } catch {
    return ''
  }
}

export const readProfileConfig = async (codexHome: string): Promise<ProfileConfigSnapshot> => {
  const path = getConfigPath(codexHome)
  const content = await readConfigFile(path)
  return {
    path,
    content,
    mcpServers: parseMcpServers(content),
  }
}

export const writeProfileConfig = async (codexHome: string, content: string): Promise<ProfileConfigSnapshot> => {
  const path = getConfigPath(codexHome)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  return {
    path,
    content,
    mcpServers: parseMcpServers(content),
  }
}

export const updateProfileMcpServers = async (
  codexHome: string,
  servers: McpServerConfig[]
): Promise<ProfileConfigSnapshot> => {
  const path = getConfigPath(codexHome)
  const current = await readConfigFile(path)
  const updatedContent = replaceMcpBlock(current, buildMcpBlock(servers))
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, updatedContent)
  return {
    path,
    content: updatedContent,
    mcpServers: parseMcpServers(updatedContent),
  }
}
