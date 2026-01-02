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
  preset: Partial<McpServerDraft>
}

const transportOptions: SelectOption[] = [
  { value: 'stdio', label: 'stdio', description: 'Launches a local MCP server command.' },
  { value: 'http', label: 'http', description: 'Connects to a streamable HTTP MCP server.' },
]

const mcpTemplates: McpTemplate[] = [
  {
    id: 'shell-tool',
    label: 'Codex Shell MCP',
    description: 'Sandbox-aware shell tool server for Codex.',
    preset: {
      name: 'shell-tool',
      transport: 'stdio',
      command: 'npx',
      args: '-y, @openai/codex-shell-tool-mcp',
    },
  },
  {
    id: 'playwright',
    label: 'Playwright MCP',
    description: 'Browser automation via Playwright.',
    preset: {
      name: 'playwright',
      transport: 'stdio',
      command: 'npx',
      args: '-y, @playwright/mcp',
    },
  },
  {
    id: 'http',
    label: 'Streamable HTTP MCP',
    description: 'Remote MCP server over HTTP.',
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

  if (!profileId) {
    return (
      <div className="p-6">
        <div className="max-w-2xl">
          <h3 className="text-base font-semibold text-text-primary mb-1">Codex Configuration</h3>
          <p className="text-sm text-text-muted">Create a profile to manage Codex configuration.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl space-y-8">
        <div>
          <h3 className="text-base font-semibold text-text-primary mb-1">Codex Configuration</h3>
          <p className="text-sm text-text-muted">
            Manage MCP servers and edit the full config.toml for each Codex profile.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px]">
            <Select
              options={profileOptions}
              value={profileId}
              onChange={setProfileId}
              placeholder="Select profile"
              size="md"
              label="Profile"
            />
          </div>
          <Button variant="ghost" size="sm" disabled={loading} onClick={handleReload}>
            Reload
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!configPath}
            onClick={handleCopyPath}
          >
            Copy path
          </Button>
          <a
            href="https://github.com/openai/codex/blob/main/docs/config.md"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Config docs
          </a>
          {configPath && (
            <span className="text-xs text-text-muted break-all">
              {configPath}
            </span>
          )}
          {connectionStatus !== 'connected' && (
            <span className="text-xs text-accent-red">
              Backend offline — connect to edit config.
            </span>
          )}
        </div>

        {status && (
          <div className={`text-xs ${status.type === 'error' ? 'text-accent-red' : 'text-accent-green'}`}>
            {status.message}
          </div>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">MCP servers</h4>
              <p className="text-xs text-text-muted">
                Configure MCP tool servers. Saves only the MCP block inside config.toml. Restart the profile to apply changes.
              </p>
              <p className="text-xs text-text-muted">
                The MCP editor rewrites MCP blocks; use raw config if you need unsupported fields.
              </p>
              <a
                href="https://github.com/openai/codex/blob/main/docs/config.md#mcp_servers"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-text-muted hover:text-text-primary transition-colors inline-block mt-1"
              >
                MCP docs
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addServer()}
                disabled={loading || connectionStatus !== 'connected'}
              >
                <Icons.Plus className="w-3.5 h-3.5" />
                Add server
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveMcp}
                disabled={loading || savingMcp || connectionStatus !== 'connected' || !mcpDirty}
              >
                Save MCP servers
              </Button>
            </div>
          </div>

          {configDirty && (
            <div className="text-xs text-accent-red">
              Raw config has unsaved changes. Save or reload before applying MCP updates.
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs text-text-muted">Quick add</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {mcpTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  disabled={loading || connectionStatus !== 'connected'}
                  onClick={() => addServer(template.preset)}
                  className="text-left border border-border rounded-lg p-3 bg-bg-secondary hover:bg-bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-xs font-semibold text-text-primary">{template.label}</div>
                  <div className="text-[11px] text-text-muted">{template.description}</div>
                </button>
              ))}
            </div>
          </div>

          {mcpDraft.length === 0 && (
            <div className="text-xs text-text-muted bg-bg-tertiary border border-border rounded-lg p-4">
              No MCP servers configured yet.
            </div>
          )}

          <div className="space-y-4">
            {mcpDraft.map((server, index) => (
              <div key={`${server.name}-${index}`} className="bg-bg-tertiary border border-border rounded-xl p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <Input
                      value={server.name}
                      placeholder="server_name"
                      onChange={(value) =>
                        updateServer(index, (prev) => ({ ...prev, name: value }))
                      }
                    />
                  </div>
                  <div className="min-w-[180px]">
                    <Select
                      options={transportOptions}
                      value={server.transport}
                      onChange={(value) =>
                        updateServer(index, (prev) => ({
                          ...prev,
                          transport: value === 'http' ? 'http' : 'stdio',
                        }))
                      }
                      size="md"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span>enabled</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={server.enabled}
                        onChange={(event) =>
                          updateServer(index, (prev) => ({ ...prev, enabled: event.target.checked }))
                        }
                      />
                      <div className="w-9 h-5 bg-bg-elevated peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-green"></div>
                    </label>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeServer(index)}
                  >
                    <Icons.Trash className="w-3.5 h-3.5" />
                    Remove
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {server.transport === 'stdio' && (
                    <>
                      <Input
                        value={server.command}
                        placeholder="command"
                        onChange={(value) =>
                          updateServer(index, (prev) => ({ ...prev, command: value }))
                        }
                      />
                      <Input
                        value={server.args}
                        placeholder="args (comma or newline)"
                        onChange={(value) =>
                          updateServer(index, (prev) => ({ ...prev, args: value }))
                        }
                      />
                    </>
                  )}
                  {server.transport === 'http' && (
                    <>
                      <Input
                        value={server.url}
                        placeholder="url"
                        onChange={(value) =>
                          updateServer(index, (prev) => ({ ...prev, url: value }))
                        }
                      />
                      <Input
                        value={server.bearer_token_env_var}
                        placeholder="bearer_token_env_var"
                        onChange={(value) =>
                          updateServer(index, (prev) => ({
                            ...prev,
                            bearer_token_env_var: value,
                          }))
                        }
                      />
                    </>
                  )}
                </div>

                <details className="rounded-lg border border-border/60 bg-bg-secondary/30 p-3">
                  <summary className="text-xs text-text-muted cursor-pointer">
                    Advanced settings
                  </summary>
                  <div className="mt-3 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        value={server.enabled_tools}
                        placeholder="enabled_tools (comma or newline)"
                        onChange={(value) =>
                          updateServer(index, (prev) => ({ ...prev, enabled_tools: value }))
                        }
                      />
                      <Input
                        value={server.disabled_tools}
                        placeholder="disabled_tools (comma or newline)"
                        onChange={(value) =>
                          updateServer(index, (prev) => ({ ...prev, disabled_tools: value }))
                        }
                      />
                      <Input
                        value={server.startup_timeout_sec}
                        placeholder="startup_timeout_sec"
                        onChange={(value) =>
                          updateServer(index, (prev) => ({
                            ...prev,
                            startup_timeout_sec: value,
                          }))
                        }
                      />
                      <Input
                        value={server.startup_timeout_ms}
                        placeholder="startup_timeout_ms (overrides sec)"
                        onChange={(value) =>
                          updateServer(index, (prev) => ({
                            ...prev,
                            startup_timeout_ms: value,
                          }))
                        }
                      />
                      <Input
                        value={server.tool_timeout_sec}
                        placeholder="tool_timeout_sec"
                        onChange={(value) =>
                          updateServer(index, (prev) => ({
                            ...prev,
                            tool_timeout_sec: value,
                          }))
                        }
                      />
                    </div>

                    {server.transport === 'stdio' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            value={server.env_vars}
                            placeholder="env_vars (comma or newline)"
                            onChange={(value) =>
                              updateServer(index, (prev) => ({ ...prev, env_vars: value }))
                            }
                          />
                          <Input
                            value={server.cwd}
                            placeholder="cwd"
                            onChange={(value) =>
                              updateServer(index, (prev) => ({ ...prev, cwd: value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-text-muted">env</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                updateServer(index, (prev) => ({
                                  ...prev,
                                  env: [...prev.env, { key: '', value: '' }],
                                }))
                              }
                            >
                              <Icons.Plus className="w-3.5 h-3.5" />
                              Add env var
                            </Button>
                          </div>
                          {server.env.length === 0 && (
                            <div className="text-xs text-text-muted">No env vars configured.</div>
                          )}
                          {server.env.map((entry, envIndex) => (
                            <div key={`${entry.key}-${envIndex}`} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                              <Input
                                value={entry.key}
                                placeholder="KEY"
                                onChange={(value) =>
                                  updateServer(index, (prev) => ({
                                    ...prev,
                                    env: prev.env.map((item, idx) =>
                                      idx === envIndex ? { ...item, key: value } : item
                                    ),
                                  }))
                                }
                              />
                              <div className="flex items-center gap-2">
                                <Input
                                  value={entry.value}
                                  placeholder="value"
                                  onChange={(value) =>
                                    updateServer(index, (prev) => ({
                                      ...prev,
                                      env: prev.env.map((item, idx) =>
                                        idx === envIndex ? { ...item, value } : item
                                      ),
                                    }))
                                  }
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    updateServer(index, (prev) => ({
                                      ...prev,
                                      env: prev.env.filter((_, idx) => idx !== envIndex),
                                    }))
                                  }
                                >
                                  <Icons.Trash className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {server.transport === 'http' && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-text-muted">http_headers</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                updateServer(index, (prev) => ({
                                  ...prev,
                                  http_headers: [...prev.http_headers, { key: '', value: '' }],
                                }))
                              }
                            >
                              <Icons.Plus className="w-3.5 h-3.5" />
                              Add header
                            </Button>
                          </div>
                          {server.http_headers.length === 0 && (
                            <div className="text-xs text-text-muted">No headers configured.</div>
                          )}
                          {server.http_headers.map((entry, headerIndex) => (
                            <div key={`${entry.key}-${headerIndex}`} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                              <Input
                                value={entry.key}
                                placeholder="Header-Name"
                                onChange={(value) =>
                                  updateServer(index, (prev) => ({
                                    ...prev,
                                    http_headers: prev.http_headers.map((item, idx) =>
                                      idx === headerIndex ? { ...item, key: value } : item
                                    ),
                                  }))
                                }
                              />
                              <div className="flex items-center gap-2">
                                <Input
                                  value={entry.value}
                                  placeholder="value"
                                  onChange={(value) =>
                                    updateServer(index, (prev) => ({
                                      ...prev,
                                      http_headers: prev.http_headers.map((item, idx) =>
                                        idx === headerIndex ? { ...item, value } : item
                                      ),
                                    }))
                                  }
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    updateServer(index, (prev) => ({
                                      ...prev,
                                      http_headers: prev.http_headers.filter((_, idx) => idx !== headerIndex),
                                    }))
                                  }
                                >
                                  <Icons.Trash className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-text-muted">env_http_headers</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                updateServer(index, (prev) => ({
                                  ...prev,
                                  env_http_headers: [...prev.env_http_headers, { key: '', value: '' }],
                                }))
                              }
                            >
                              <Icons.Plus className="w-3.5 h-3.5" />
                              Add env header
                            </Button>
                          </div>
                          {server.env_http_headers.length === 0 && (
                            <div className="text-xs text-text-muted">No env headers configured.</div>
                          )}
                          {server.env_http_headers.map((entry, headerIndex) => (
                            <div key={`${entry.key}-${headerIndex}`} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                              <Input
                                value={entry.key}
                                placeholder="Header-Name"
                                onChange={(value) =>
                                  updateServer(index, (prev) => ({
                                    ...prev,
                                    env_http_headers: prev.env_http_headers.map((item, idx) =>
                                      idx === headerIndex ? { ...item, key: value } : item
                                    ),
                                  }))
                                }
                              />
                              <div className="flex items-center gap-2">
                                <Input
                                  value={entry.value}
                                  placeholder="ENV_VAR"
                                  onChange={(value) =>
                                    updateServer(index, (prev) => ({
                                      ...prev,
                                      env_http_headers: prev.env_http_headers.map((item, idx) =>
                                        idx === headerIndex ? { ...item, value } : item
                                      ),
                                    }))
                                  }
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    updateServer(index, (prev) => ({
                                      ...prev,
                                      env_http_headers: prev.env_http_headers.filter((_, idx) => idx !== headerIndex),
                                    }))
                                  }
                                >
                                  <Icons.Trash className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Raw config.toml</h4>
              <p className="text-xs text-text-muted">
                Edit any Codex configuration (models, sandboxing, features, profiles). Restart the profile to apply changes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetConfig}
                disabled={loading || savingConfig || connectionStatus !== 'connected'}
              >
                Reset config
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfigDraft(configSaved)}
                disabled={loading || !configDirty}
              >
                Discard changes
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveConfig}
                disabled={loading || savingConfig || connectionStatus !== 'connected' || !configDirty}
              >
                Save config
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px]">
              <Select
                options={configSnippetOptions}
                value={snippetId}
                onChange={setSnippetId}
                placeholder="Insert snippet"
                size="sm"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedSnippet}
              onClick={() => {
                if (selectedSnippet) {
                  insertSnippet(selectedSnippet.content)
                }
              }}
            >
              Insert snippet
            </Button>
            {selectedSnippet && (
              <span className="text-xs text-text-muted">
                {selectedSnippet.description}
              </span>
            )}
          </div>
          <textarea
            value={configDraft}
            onChange={(event) => setConfigDraft(event.target.value)}
            placeholder="# config.toml"
            className="w-full min-h-[240px] bg-bg-tertiary border border-border rounded-xl p-4 text-xs text-text-primary font-mono outline-none focus:border-text-muted transition-colors"
            spellCheck={false}
            disabled={loading || connectionStatus !== 'connected'}
          />
        </section>
      </div>
    </div>
  )
}
