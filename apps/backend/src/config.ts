import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export type HubConfig = {
  host: string
  port: number
  dataDir: string
  profilesDir: string
  defaultCodexHome: string
  defaultCwd: string
  codexBin: string
  codexArgs: string[]
  codexAppServerArgs: string[]
  authToken: string
  clientInfo: {
    name: string
    title: string
    version: string
  }
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 7711

const DEFAULT_CLIENT_INFO = {
  name: 'codex-hub',
  title: 'Codex Hub Backend',
  version: '0.1.0',
}

const inferWorkspaceCwd = () => {
  const explicit = process.env.CODEX_HUB_DEFAULT_CWD ?? process.env.CODEX_DEFAULT_CWD
  if (explicit) {
    return explicit
  }
  const cwd = process.cwd()
  if (cwd.endsWith(`${join('apps', 'backend')}`)) {
    return resolve(cwd, '..', '..')
  }
  return cwd
}

const parseJsonArgs = (value: string | undefined): string[] | null => {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : null
  } catch {
    return null
  }
}

const parseSpaceArgs = (value: string | undefined): string[] => {
  if (!value) {
    return []
  }
  return value
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

export const loadConfig = (): HubConfig => {
  const dataDir =
    process.env.CODEX_HUB_DATA_DIR ?? join(homedir(), '.codex-hub')
  const profilesDir =
    process.env.CODEX_HUB_PROFILES_DIR ?? join(homedir(), '.codex', 'profiles')
  const defaultCodexHome =
    process.env.CODEX_HUB_DEFAULT_CODEX_HOME ?? join(homedir(), '.codex')

  const defaultCwd = inferWorkspaceCwd()

  const codexArgs =
    parseJsonArgs(process.env.CODEX_FLAGS_JSON) ??
    parseSpaceArgs(process.env.CODEX_FLAGS)
  const codexAppServerArgs =
    parseJsonArgs(process.env.CODEX_APP_SERVER_FLAGS_JSON) ??
    parseSpaceArgs(process.env.CODEX_APP_SERVER_FLAGS)

  const authToken = process.env.CODEX_HUB_TOKEN ?? randomUUID()

  return {
    host: process.env.CODEX_HUB_HOST ?? DEFAULT_HOST,
    port: Number(process.env.CODEX_HUB_PORT ?? DEFAULT_PORT),
    dataDir,
    profilesDir,
    defaultCodexHome,
    defaultCwd,
    codexBin: process.env.CODEX_BIN ?? 'codex',
    codexArgs,
    codexAppServerArgs,
    authToken,
    clientInfo: DEFAULT_CLIENT_INFO,
  }
}
