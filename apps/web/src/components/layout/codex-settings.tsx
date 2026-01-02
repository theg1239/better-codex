import { useEffect, useMemo, useState } from 'react'
import { hubClient, type McpServerConfig } from '../../services/hub-client'
import { useAppStore } from '../../store'
import { Button, Icons, Input, Select, type SelectOption } from '../ui'

type EnvEntry = { key: string; value: string }

type McpServerDraft = {
  name: string
  transport: 'stdio' | 'http'
  command: string
  args: string
  env: EnvEntry[]
  env_vars: string
  cwd: string
  url: string
  bearer_token_env_var: string
  http_headers: EnvEntry[]
  env_http_headers: EnvEntry[]
  enabled: boolean
  startup_timeout_sec: string
  startup_timeout_ms: string
  tool_timeout_sec: string
  enabled_tools: string
  disabled_tools: string
}

type StatusMessage = { type: 'error' | 'success'; message: string }

type McpTemplate = {
  id: string
  label: string
  description: string
  icon: 'terminal' | 'globe' | 'bolt'
  preset: Partial<McpServerDraft>
}

type ActiveTab = 'servers' | 'config'

const transportOptions: SelectOption[] = [
  { value: 'stdio', label: 'Local (stdio)', description: 'Launches a local MCP server command.' },
  { value: 'http', label: 'Remote (HTTP)', description: 'Connects to a streamable HTTP MCP server.' },
]

const mcpTemplates: McpTemplate[] = [
  {
    id: 'shell-tool',
    label: 'Shell Tool',
    description: 'Sandbox-aware shell commands',
    icon: 'terminal',
    preset: {
      name: 'shell-tool',
      transport: 'stdio',
      command: 'npx',
      args: '-y, @openai/codex-shell-tool-mcp',
    },
  },
  {
    id: 'playwright',
    label: 'Playwright',
    description: 'Browser automation',
    icon: 'globe',
    preset: {
      name: 'playwright',
      transport: 'stdio',
      command: 'npx',
      args: '-y, @playwright/mcp',
    },
  },
  {
    id: 'http',
    label: 'HTTP Server',
    description: 'Remote MCP endpoint',
    icon: 'bolt',
    preset: {
      name: 'remote-mcp',
      transport: 'http',
      url: 'https://mcp.example.com/mcp',
      bearer_token_env_var: 'MCP_TOKEN',
    },
  },
]

type ConfigSnippet = {
  id: string
  label: string
  description: string
  content: string
}

const configSnippets: ConfigSnippet[] = [
  {
    id: 'mcp-stdio',
    label: 'MCP stdio server',
    description: 'Local command-based MCP server.',
    content: `[mcp_servers.docs]
command = "npx"
args = ["-y", "mcp-server"]
`,
  },
  {
    id: 'mcp-http',
    label: 'MCP HTTP server',
    description: 'Streamable HTTP MCP with bearer token.',
    content: `[mcp_servers.remote]
url = "https://mcp.example.com/mcp"
bearer_token_env_var = "MCP_TOKEN"
`,
  },
  {
    id: 'sandbox',
    label: 'Sandbox + approvals',
    description: 'Approval policy and sandbox preset.',
    content: `approval_policy = "on-request"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
writable_roots = ["/path/to/workspace"]
network_access = false
`,
  },
  {
    id: 'features',
    label: 'Feature flags',
    description: 'Centralized feature toggles.',
    content: `[features]
unified_exec = false
apply_patch_freeform = false
view_image_tool = true
web_search_request = false
`,
  },
  {
    id: 'provider',
    label: 'Model provider',
    description: 'Override a model provider endpoint.',
    content: `[model_providers.acme]
name = "Acme"
base_url = "https://api.acme.example/v1"
env_key = "ACME_API_KEY"
wire_api = "responses"
`,
  },
]

const configSnippetOptions: SelectOption[] = configSnippets.map((snippet) => ({
  value: snippet.id,
  label: snippet.label,
  description: snippet.description,
}))

// Field label component for consistent styling
function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-xs font-medium text-text-secondary">{children}</span>
      {hint && <span className="text-[10px] text-text-muted">({hint})</span>}
    </div>
  )
}

// Card component for server entries
function ServerCard({
  server,
  onUpdate,
  onRemove,
  disabled,
}: {
  server: McpServerDraft
  index: number
  onUpdate: (updater: (prev: McpServerDraft) => McpServerDraft) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className={`group relative rounded-xl border transition-all duration-200 ${
      server.enabled 
        ? 'bg-bg-secondary border-border hover:border-text-muted/40' 
        : 'bg-bg-primary border-border/50 opacity-60'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <div className={`w-2 h-2 rounded-full transition-colors ${
          server.enabled ? 'bg-accent-green' : 'bg-text-muted'
        }`} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={server.name}
              placeholder="server_name"
              disabled={disabled}
              onChange={(e) => onUpdate((prev) => ({ ...prev, name: e.target.value }))}
              className="bg-transparent text-sm font-medium text-text-primary placeholder:text-text-muted outline-none flex-1 min-w-0"
            />
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              server.transport === 'http' 
                ? 'bg-accent-blue/15 text-accent-blue' 
                : 'bg-accent-green/15 text-accent-green'
            }`}>
              {server.transport.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {server.transport === 'http' 
              ? server.url || 'No URL configured' 
              : server.command ? `${server.command} ${server.args}` : 'No command configured'
            }
          </p>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onUpdate((prev) => ({ ...prev, enabled: !prev.enabled }))}
            disabled={disabled}
            className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
            title={server.enabled ? 'Disable server' : 'Enable server'}
          >
            {server.enabled ? (
              <Icons.Check className="w-4 h-4" />
            ) : (
              <Icons.X className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            disabled={disabled}
            className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <Icons.Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="p-1.5 rounded-lg hover:bg-accent-red/10 text-text-muted hover:text-accent-red transition-colors"
          >
            <Icons.Trash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border/60 p-4 space-y-4 bg-bg-primary/50 rounded-b-xl">
          {/* Transport selection */}
          <div>
            <FieldLabel>Transport Type</FieldLabel>
            <div className="flex gap-2">
              {transportOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onUpdate((prev) => ({ ...prev, transport: opt.value as 'stdio' | 'http' }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    server.transport === opt.value
                      ? 'bg-text-primary text-bg-primary'
                      : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transport-specific fields */}
          {server.transport === 'stdio' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Command</FieldLabel>
                <Input
                  value={server.command}
                  placeholder="npx, node, python..."
                  onChange={(value) => onUpdate((prev) => ({ ...prev, command: value }))}
                />
              </div>
              <div>
                <FieldLabel hint="comma separated">Arguments</FieldLabel>
                <Input
                  value={server.args}
                  placeholder="-y, @package/name"
                  onChange={(value) => onUpdate((prev) => ({ ...prev, args: value }))}
                />
              </div>
              <div className="md:col-span-2">
                <FieldLabel>Working Directory</FieldLabel>
                <Input
                  value={server.cwd}
                  placeholder="/path/to/working/directory"
                  onChange={(value) => onUpdate((prev) => ({ ...prev, cwd: value }))}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <FieldLabel>Server URL</FieldLabel>
                <Input
                  value={server.url}
                  placeholder="https://mcp.example.com/mcp"
                  onChange={(value) => onUpdate((prev) => ({ ...prev, url: value }))}
                />
              </div>
              <div>
                <FieldLabel hint="environment variable name">Bearer Token</FieldLabel>
                <Input
                  value={server.bearer_token_env_var}
                  placeholder="MCP_TOKEN"
                  onChange={(value) => onUpdate((prev) => ({ ...prev, bearer_token_env_var: value }))}
                />
              </div>
            </div>
          )}

          {/* Environment variables for stdio */}
          {server.transport === 'stdio' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <FieldLabel>Environment Variables</FieldLabel>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onUpdate((prev) => ({ ...prev, env: [...prev.env, { key: '', value: '' }] }))}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  + Add variable
                </button>
              </div>
              {server.env.length === 0 ? (
                <p className="text-xs text-text-muted italic">No environment variables</p>
              ) : (
                <div className="space-y-2">
                  {server.env.map((entry, envIndex) => (
                    <div key={envIndex} className="flex items-center gap-2">
                      <Input
                        value={entry.key}
                        placeholder="KEY"
                        onChange={(value) => onUpdate((prev) => ({
                          ...prev,
                          env: prev.env.map((item, idx) => idx === envIndex ? { ...item, key: value } : item),
                        }))}
                        className="flex-1"
                      />
                      <span className="text-text-muted">=</span>
                      <Input
                        value={entry.value}
                        placeholder="value"
                        onChange={(value) => onUpdate((prev) => ({
                          ...prev,
                          env: prev.env.map((item, idx) => idx === envIndex ? { ...item, value } : item),
                        }))}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdate((prev) => ({
                          ...prev,
                          env: prev.env.filter((_, idx) => idx !== envIndex),
                        }))}
                        className="p-1.5 rounded hover:bg-accent-red/10 text-text-muted hover:text-accent-red transition-colors"
                      >
                        <Icons.X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HTTP Headers for http transport */}
          {server.transport === 'http' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <FieldLabel>HTTP Headers</FieldLabel>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onUpdate((prev) => ({ ...prev, http_headers: [...prev.http_headers, { key: '', value: '' }] }))}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  + Add header
                </button>
              </div>
              {server.http_headers.length === 0 ? (
                <p className="text-xs text-text-muted italic">No custom headers</p>
              ) : (
                <div className="space-y-2">
                  {server.http_headers.map((entry, headerIndex) => (
                    <div key={headerIndex} className="flex items-center gap-2">
                      <Input
                        value={entry.key}
                        placeholder="Header-Name"
                        onChange={(value) => onUpdate((prev) => ({
                          ...prev,
                          http_headers: prev.http_headers.map((item, idx) => idx === headerIndex ? { ...item, key: value } : item),
                        }))}
                        className="flex-1"
                      />
                      <span className="text-text-muted">:</span>
                      <Input
                        value={entry.value}
                        placeholder="value"
                        onChange={(value) => onUpdate((prev) => ({
                          ...prev,
                          http_headers: prev.http_headers.map((item, idx) => idx === headerIndex ? { ...item, value } : item),
                        }))}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdate((prev) => ({
                          ...prev,
                          http_headers: prev.http_headers.filter((_, idx) => idx !== headerIndex),
                        }))}
                        className="p-1.5 rounded hover:bg-accent-red/10 text-text-muted hover:text-accent-red transition-colors"
                      >
                        <Icons.X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Advanced section */}
          <details className="group/advanced">
            <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary transition-colors list-none flex items-center gap-1">
              <Icons.ChevronRight className="w-3 h-3 transition-transform group-open/advanced:rotate-90" />
              Advanced options
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <FieldLabel hint="seconds">Startup Timeout</FieldLabel>
                <Input
                  value={server.startup_timeout_sec}
                  placeholder="30"
                  onChange={(value) => onUpdate((prev) => ({ ...prev, startup_timeout_sec: value }))}
                />
              </div>
              <div>
                <FieldLabel hint="seconds">Tool Timeout</FieldLabel>
                <Input
                  value={server.tool_timeout_sec}
                  placeholder="60"
                  onChange={(value) => onUpdate((prev) => ({ ...prev, tool_timeout_sec: value }))}
                />
              </div>
              <div>
                <FieldLabel hint="comma separated">Enabled Tools</FieldLabel>
                <Input
                  value={server.enabled_tools}
                  placeholder="tool1, tool2"
                  onChange={(value) => onUpdate((prev) => ({ ...prev, enabled_tools: value }))}
                />
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

const splitList = (value: string) =>
  value
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean)

const toEntryList = (record: Record<string, string> | undefined): EnvEntry[] =>
  Object.entries(record ?? {}).map(([key, value]) => ({ key, value }))

const toRecord = (entries: EnvEntry[]): Record<string, string> | undefined => {
  const filtered = entries
    .map((entry) => ({ key: entry.key.trim(), value: entry.value }))
    .filter((entry) => entry.key.length > 0)
  if (filtered.length === 0) {
    return undefined
  }
  return Object.fromEntries(filtered.map((entry) => [entry.key, entry.value]))
}

const listToString = (items: string[] | undefined) => (items ?? []).join(', ')

const toDraft = (server: McpServerConfig): McpServerDraft => ({
  name: server.name,
  transport: server.url ? 'http' : 'stdio',
  command: server.command ?? '',
  args: listToString(server.args),
  env: toEntryList(server.env),
  env_vars: listToString(server.env_vars),
  cwd: server.cwd ?? '',
  url: server.url ?? '',
  bearer_token_env_var: server.bearer_token_env_var ?? '',
  http_headers: toEntryList(server.http_headers),
  env_http_headers: toEntryList(server.env_http_headers),
  enabled: server.enabled ?? true,
  startup_timeout_sec:
    server.startup_timeout_ms !== undefined
      ? ''
      : server.startup_timeout_sec !== undefined
        ? String(server.startup_timeout_sec)
        : '',
  startup_timeout_ms: server.startup_timeout_ms !== undefined ? String(server.startup_timeout_ms) : '',
  tool_timeout_sec: server.tool_timeout_sec !== undefined ? String(server.tool_timeout_sec) : '',
  enabled_tools: listToString(server.enabled_tools),
  disabled_tools: listToString(server.disabled_tools),
})

const toConfig = (draft: McpServerDraft): McpServerConfig => {
  const env = toRecord(draft.env)
  const httpHeaders = toRecord(draft.http_headers)
  const envHttpHeaders = toRecord(draft.env_http_headers)

  const listOrUndefined = (value: string) => {
    const items = splitList(value)
    return items.length ? items : undefined
  }

  const numberOrUndefined = (value: string) => {
    if (!value.trim()) {
      return undefined
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const startupTimeoutMs = numberOrUndefined(draft.startup_timeout_ms)
  const startupTimeoutSec = startupTimeoutMs === undefined ? numberOrUndefined(draft.startup_timeout_sec) : undefined

  const base: McpServerConfig = {
    name: draft.name.trim(),
    enabled: draft.enabled ? undefined : false,
    startup_timeout_sec: startupTimeoutSec,
    startup_timeout_ms: startupTimeoutMs,
    tool_timeout_sec: numberOrUndefined(draft.tool_timeout_sec),
    enabled_tools: listOrUndefined(draft.enabled_tools),
    disabled_tools: listOrUndefined(draft.disabled_tools),
  }

  if (draft.transport === 'http') {
    return {
      ...base,
      url: draft.url.trim() || undefined,
      bearer_token_env_var: draft.bearer_token_env_var.trim() || undefined,
      http_headers: httpHeaders,
      env_http_headers: envHttpHeaders,
    }
  }

  return {
    ...base,
    command: draft.command.trim() || undefined,
    args: listOrUndefined(draft.args),
    env,
    env_vars: listOrUndefined(draft.env_vars),
    cwd: draft.cwd.trim() || undefined,
  }
}

export function CodexSettings() {
  const { accounts, selectedAccountId, connectionStatus } = useAppStore()
  const profileOptions = useMemo<SelectOption[]>(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: account.name,
      })),
    [accounts]
  )
  const [profileId, setProfileId] = useState<string | null>(
    selectedAccountId ?? accounts[0]?.id ?? null
  )
  const [configPath, setConfigPath] = useState('')
  const [configSaved, setConfigSaved] = useState('')
  const [configDraft, setConfigDraft] = useState('')
  const [mcpDraft, setMcpDraft] = useState<McpServerDraft[]>([])
  const [mcpBaseline, setMcpBaseline] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingMcp, setSavingMcp] = useState(false)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [snippetId, setSnippetId] = useState(configSnippets[0]?.id ?? '')

  const configDirty = configDraft !== configSaved
  const mcpDirty = mcpBaseline !== JSON.stringify(mcpDraft)
  const selectedSnippet = configSnippets.find((snippet) => snippet.id === snippetId) ?? null

  useEffect(() => {
    if (selectedAccountId) {
      setProfileId(selectedAccountId)
    } else if (!profileId && accounts.length > 0) {
      setProfileId(accounts[0].id)
    }
  }, [accounts, profileId, selectedAccountId])

  useEffect(() => {
    if (!profileId) {
      return
    }
    let active = true
    setLoading(true)
    setStatus(null)
    hubClient
      .getProfileConfig(profileId)
      .then((snapshot) => {
        if (!active) return
        setConfigPath(snapshot.path)
        setConfigSaved(snapshot.content)
        setConfigDraft(snapshot.content)
        const nextDraft = snapshot.mcpServers.map(toDraft)
        setMcpDraft(nextDraft)
        setMcpBaseline(JSON.stringify(nextDraft))
      })
      .catch(() => {
        if (!active) return
        setStatus({ type: 'error', message: 'Failed to load config for this profile.' })
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [profileId])

  const updateServer = (index: number, updater: (server: McpServerDraft) => McpServerDraft) => {
    setMcpDraft((prev) => prev.map((server, idx) => (idx === index ? updater(server) : server)))
  }

  const createEmptyServer = (): McpServerDraft => ({
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    env: [],
    env_vars: '',
    cwd: '',
    url: '',
    bearer_token_env_var: '',
    http_headers: [],
    env_http_headers: [],
    enabled: true,
    startup_timeout_sec: '',
    startup_timeout_ms: '',
    tool_timeout_sec: '',
    enabled_tools: '',
    disabled_tools: '',
  })

  const addServer = (preset?: Partial<McpServerDraft>) => {
    setMcpDraft((prev) => [
      ...prev,
      {
        ...createEmptyServer(),
        ...preset,
      },
    ])
  }

  const removeServer = (index: number) => {
    setMcpDraft((prev) => prev.filter((_, idx) => idx !== index))
  }

  const validateServers = () => {
    for (const server of mcpDraft) {
      const name = server.name.trim()
      if (!name) {
        return 'Every MCP server needs a name.'
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
        return `Invalid MCP server name: "${name}".`
      }
      if (server.transport === 'http' && !server.url.trim()) {
        return `Server "${name}" needs a URL.`
      }
      if (server.transport === 'stdio' && !server.command.trim()) {
        return `Server "${name}" needs a command.`
      }
    }
    return null
  }

  const insertSnippet = (snippet: string) => {
    if (!snippet.trim()) {
      return
    }

    const snippetLines = snippet.split(/\r?\n/u)
    const isTableHeader = (line: string) => /^\s*\[[^\]]+\]\s*$/u.test(line)
    const hasRootAssignment = () => {
      for (const line of snippetLines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) {
          continue
        }
        if (isTableHeader(trimmed)) {
          return false
        }
        if (trimmed.includes('=')) {
          return true
        }
      }
      return false
    }

    setConfigDraft((prev) => {
      const trimmedSnippet = snippet.trimEnd()
      const lines = prev.split(/\r?\n/u)
      const firstTableIndex = lines.findIndex((line) => isTableHeader(line.trim()))

      if (!hasRootAssignment() || firstTableIndex === -1) {
        const trimmed = prev.trimEnd()
        if (!trimmed) {
          return `${trimmedSnippet}\n`
        }
        return `${trimmed}\n\n${trimmedSnippet}\n`
      }

      const before = lines.slice(0, firstTableIndex).join('\n').trimEnd()
      const after = lines.slice(firstTableIndex).join('\n').trimStart()
      const parts = []
      if (before) parts.push(before)
      parts.push(trimmedSnippet)
      if (after) parts.push(after)
      return `${parts.join('\n\n')}\n`
    })
  }

  const handleCopyPath = async () => {
    if (!configPath || !navigator?.clipboard) {
      return
    }
    try {
      await navigator.clipboard.writeText(configPath)
      setStatus({ type: 'success', message: 'Config path copied to clipboard.' })
    } catch {
      setStatus({ type: 'error', message: 'Unable to copy config path.' })
    }
  }

  const handleReload = async () => {
    if (!profileId) return
    setLoading(true)
    setStatus(null)
    try {
      const snapshot = await hubClient.getProfileConfig(profileId)
      setConfigPath(snapshot.path)
      setConfigSaved(snapshot.content)
      setConfigDraft(snapshot.content)
      const nextDraft = snapshot.mcpServers.map(toDraft)
      setMcpDraft(nextDraft)
      setMcpBaseline(JSON.stringify(nextDraft))
    } catch {
      setStatus({ type: 'error', message: 'Failed to reload config.' })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveConfig = async () => {
    if (!profileId) return
    setSavingConfig(true)
    setStatus(null)
    try {
      const snapshot = await hubClient.saveProfileConfig(profileId, configDraft)
      setConfigPath(snapshot.path)
      setConfigSaved(snapshot.content)
      setConfigDraft(snapshot.content)
      const nextDraft = snapshot.mcpServers.map(toDraft)
      setMcpDraft(nextDraft)
      setMcpBaseline(JSON.stringify(nextDraft))
      setStatus({ type: 'success', message: 'Config saved.' })
    } catch {
      setStatus({ type: 'error', message: 'Failed to save config.' })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleResetConfig = async () => {
    if (!profileId) return
    const confirmed = window.confirm(
      'Reset config.toml to defaults? This clears the file and removes any MCP server settings.'
    )
    if (!confirmed) {
      return
    }
    setSavingConfig(true)
    setStatus(null)
    try {
      const snapshot = await hubClient.saveProfileConfig(profileId, '')
      setConfigPath(snapshot.path)
      setConfigSaved(snapshot.content)
      setConfigDraft(snapshot.content)
      const nextDraft = snapshot.mcpServers.map(toDraft)
      setMcpDraft(nextDraft)
      setMcpBaseline(JSON.stringify(nextDraft))
      setStatus({ type: 'success', message: 'Config reset to defaults.' })
    } catch {
      setStatus({ type: 'error', message: 'Failed to reset config.' })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleSaveMcp = async () => {
    if (!profileId) return
    if (configDirty) {
      setStatus({ type: 'error', message: 'Save or discard raw config changes before saving MCP servers.' })
      return
    }
    const validationError = validateServers()
    if (validationError) {
      setStatus({ type: 'error', message: validationError })
      return
    }
    setSavingMcp(true)
    setStatus(null)
    try {
      const snapshot = await hubClient.saveMcpServers(profileId, mcpDraft.map(toConfig))
      setConfigPath(snapshot.path)
      setConfigSaved(snapshot.content)
      setConfigDraft(snapshot.content)
      const nextDraft = snapshot.mcpServers.map(toDraft)
      setMcpDraft(nextDraft)
      setMcpBaseline(JSON.stringify(nextDraft))
      setStatus({ type: 'success', message: 'MCP servers saved.' })
    } catch {
      setStatus({ type: 'error', message: 'Failed to save MCP servers.' })
    } finally {
      setSavingMcp(false)
    }
  }

  const [activeTab, setActiveTab] = useState<ActiveTab>('servers')

  if (!profileId) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center mx-auto mb-4">
            <Icons.Settings className="w-6 h-6 text-text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">No Profile Selected</h3>
          <p className="text-sm text-text-muted">
            Create or select a profile to configure Codex settings and MCP servers.
          </p>
        </div>
      </div>
    )
  }

  const isDisabled = loading || connectionStatus !== 'connected'

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-bg-secondary/50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Configuration</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Manage MCP servers and Codex settings
              </p>
            </div>
            
            {connectionStatus !== 'connected' && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-red/10 border border-accent-red/20">
                <div className="w-2 h-2 rounded-full bg-accent-red animate-pulse" />
                <span className="text-xs font-medium text-accent-red">Backend Offline</span>
              </div>
            )}
          </div>

          {/* Profile selector and actions */}
          <div className="flex items-center gap-3">
            <div className="flex-1 max-w-[240px]">
              <Select
                options={profileOptions}
                value={profileId}
                onChange={setProfileId}
                placeholder="Select profile"
                size="md"
              />
            </div>
            
            <div className="h-5 w-px bg-border" />
            
            <button
              type="button"
              onClick={handleReload}
              disabled={loading}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
              title="Reload configuration"
            >
              <Icons.Loader className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            <button
              type="button"
              onClick={handleCopyPath}
              disabled={!configPath}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
              title="Copy config path"
            >
              <Icons.Copy className="w-4 h-4" />
            </button>

            <a
              href="https://github.com/openai/codex/blob/main/docs/config.md"
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
              title="View documentation"
            >
              <Icons.Help className="w-4 h-4" />
            </a>
          </div>

          {/* Config path */}
          {configPath && (
            <div className="mt-3 text-[11px] text-text-muted font-mono bg-bg-primary/50 px-2 py-1 rounded inline-block">
              {configPath}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="px-6 flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('servers')}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative ${
              activeTab === 'servers'
                ? 'text-text-primary bg-bg-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            MCP Servers
            {mcpDraft.length > 0 && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === 'servers' ? 'bg-bg-tertiary' : 'bg-bg-tertiary/50'
              }`}>
                {mcpDraft.length}
              </span>
            )}
            {mcpDirty && (
              <span className="absolute top-2 right-1 w-1.5 h-1.5 rounded-full bg-accent-blue" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative ${
              activeTab === 'config'
                ? 'text-text-primary bg-bg-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Raw Config
            {configDirty && (
              <span className="absolute top-2 right-1 w-1.5 h-1.5 rounded-full bg-accent-blue" />
            )}
          </button>
        </div>
      </div>

      {/* Status message */}
      {status && (
        <div className={`mx-6 mt-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
          status.type === 'error' 
            ? 'bg-accent-red/10 text-accent-red border border-accent-red/20' 
            : 'bg-accent-green/10 text-accent-green border border-accent-green/20'
        }`}>
          {status.type === 'error' ? (
            <Icons.Warning className="w-4 h-4 shrink-0" />
          ) : (
            <Icons.Check className="w-4 h-4 shrink-0" />
          )}
          {status.message}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'servers' ? (
          <div className="max-w-3xl space-y-6">
            {/* Quick add templates */}
            <div>
              <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
                Quick Add
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {mcpTemplates.map((template) => {
                  const IconComponent = template.icon === 'terminal' ? Icons.Terminal 
                    : template.icon === 'globe' ? Icons.Globe 
                    : Icons.Bolt
                  return (
                    <button
                      key={template.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => addServer(template.preset)}
                      className="group flex items-start gap-3 p-4 rounded-xl border border-border bg-bg-secondary hover:bg-bg-hover hover:border-text-muted/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
                    >
                      <div className="w-9 h-9 rounded-lg bg-bg-tertiary group-hover:bg-bg-primary flex items-center justify-center shrink-0 transition-colors">
                        <IconComponent className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary">{template.label}</div>
                        <div className="text-xs text-text-muted mt-0.5">{template.description}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Server list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  Configured Servers
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addServer()}
                    disabled={isDisabled}
                    className="text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <Icons.Plus className="w-3.5 h-3.5" />
                    Add empty
                  </button>
                </div>
              </div>

              {mcpDraft.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-bg-secondary/30 p-8 text-center">
                  <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center mx-auto mb-3">
                    <Icons.Bolt className="w-5 h-5 text-text-muted" />
                  </div>
                  <p className="text-sm text-text-muted mb-1">No MCP servers configured</p>
                  <p className="text-xs text-text-muted/70">
                    Add a server template above or create a custom one
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mcpDraft.map((server, index) => (
                    <ServerCard
                      key={`${server.name}-${index}`}
                      server={server}
                      index={index}
                      onUpdate={(updater) => updateServer(index, updater)}
                      onRemove={() => removeServer(index)}
                      disabled={isDisabled}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Save button - sticky at bottom when there are changes */}
            {mcpDirty && (
              <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-bg-primary via-bg-primary to-transparent">
                <div className="flex items-center justify-between p-4 rounded-xl bg-bg-secondary border border-border">
                  <div className="text-sm text-text-muted">
                    {configDirty ? (
                      <span className="text-accent-red">Save raw config first before saving MCP servers</span>
                    ) : (
                      'You have unsaved changes'
                    )}
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveMcp}
                    disabled={isDisabled || savingMcp || configDirty}
                  >
                    {savingMcp ? 'Saving...' : 'Save MCP Servers'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl space-y-6">
            {/* Snippets */}
            <div>
              <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
                Insert Snippet
              </h4>
              <div className="flex items-center gap-3">
                <div className="flex-1 max-w-[280px]">
                  <Select
                    options={configSnippetOptions}
                    value={snippetId}
                    onChange={setSnippetId}
                    placeholder="Choose a snippet"
                    size="md"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!selectedSnippet || isDisabled}
                  onClick={() => {
                    if (selectedSnippet) {
                      insertSnippet(selectedSnippet.content)
                    }
                  }}
                >
                  Insert
                </Button>
                {selectedSnippet && (
                  <span className="text-xs text-text-muted">
                    {selectedSnippet.description}
                  </span>
                )}
              </div>
            </div>

            {/* Editor */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  config.toml
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfigDraft(configSaved)}
                    disabled={!configDirty || isDisabled}
                    className="text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                  >
                    Discard changes
                  </button>
                  <button
                    type="button"
                    onClick={handleResetConfig}
                    disabled={isDisabled || savingConfig}
                    className="text-xs text-accent-red/70 hover:text-accent-red transition-colors disabled:opacity-50"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
              
              <div className="relative">
                <textarea
                  value={configDraft}
                  onChange={(event) => setConfigDraft(event.target.value)}
                  placeholder="# config.toml&#10;&#10;# Add your configuration here..."
                  className="w-full min-h-[400px] bg-bg-secondary border border-border rounded-xl p-4 text-sm text-text-primary font-mono outline-none focus:border-text-muted/50 transition-colors resize-y"
                  spellCheck={false}
                  disabled={isDisabled}
                />
                {configDirty && (
                  <div className="absolute top-3 right-3 text-[10px] px-2 py-1 rounded bg-accent-blue/15 text-accent-blue font-medium">
                    Modified
                  </div>
                )}
              </div>
            </div>

            {/* Save button */}
            {configDirty && (
              <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-bg-primary via-bg-primary to-transparent">
                <div className="flex items-center justify-between p-4 rounded-xl bg-bg-secondary border border-border">
                  <div className="text-sm text-text-muted">
                    You have unsaved config changes
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveConfig}
                    disabled={isDisabled || savingConfig}
                  >
                    {savingConfig ? 'Saving...' : 'Save Config'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
