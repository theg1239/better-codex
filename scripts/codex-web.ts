/// <reference types="bun-types" />

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

type Options = {
  root?: string
  host: string
  backendPort: number
  webPort: number
  open: boolean
}

const DEFAULTS: Options = {
  host: '127.0.0.1',
  backendPort: 7711,
  webPort: 5173,
  open: false,
}

const parseArgs = (): Options => {
  const args = Bun.argv.slice(2)
  const options: Options = { ...DEFAULTS }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--root') {
      options.root = args[i + 1]
      i += 1
      continue
    }
    if (arg === '--host') {
      options.host = args[i + 1] ?? DEFAULTS.host
      i += 1
      continue
    }
    if (arg === '--backend-port') {
      options.backendPort = Number(args[i + 1] ?? DEFAULTS.backendPort)
      i += 1
      continue
    }
    if (arg === '--web-port') {
      options.webPort = Number(args[i + 1] ?? DEFAULTS.webPort)
      i += 1
      continue
    }
    if (arg === '--open') {
      options.open = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
    console.error(`Unknown option: ${arg}`)
    printHelp()
    process.exit(1)
  }
  return options
}

const printHelp = () => {
  console.log(`codex web

Usage:
  codex web [--root PATH] [--host 127.0.0.1] [--backend-port 7711] [--web-port 5173] [--open]
`)
}

const findRoot = (explicit?: string) => {
  let current = resolve(explicit ?? process.cwd())
  for (let depth = 0; depth < 8; depth += 1) {
    if (isRoot(current)) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  throw new Error(
    'Could not locate apps/backend and apps/web. Run from the repo root or pass --root.'
  )
}

const isRoot = (dir: string) =>
  existsSync(join(dir, 'apps', 'backend', 'package.json')) &&
  existsSync(join(dir, 'apps', 'web', 'package.json'))

const openUrl = (url: string) => {
  const platform = process.platform
  const cmd =
    platform === 'darwin'
      ? ['open', url]
      : platform === 'win32'
        ? ['cmd', '/C', 'start', url]
        : ['xdg-open', url]
  Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' })
}

const run = async () => {
  const options = parseArgs()
  const root = findRoot(options.root)
  const backendDir = join(root, 'apps', 'backend')
  const webDir = join(root, 'apps', 'web')
  const token = crypto.randomUUID()
  const backendUrl = `http://${options.host}:${options.backendPort}`
  const webUrl = `http://${options.host}:${options.webPort}`

  const backend = Bun.spawn(['bun', 'run', 'dev'], {
    cwd: backendDir,
    env: {
      ...Bun.env,
      CODEX_HUB_HOST: options.host,
      CODEX_HUB_PORT: String(options.backendPort),
      CODEX_HUB_TOKEN: token,
      CODEX_HUB_DEFAULT_CWD: root,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const web = Bun.spawn(['bun', 'run', 'dev', '--', '--host', options.host, '--port', String(options.webPort)], {
    cwd: webDir,
    env: {
      ...Bun.env,
      VITE_CODEX_HUB_URL: backendUrl,
      VITE_CODEX_HUB_TOKEN: token,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  })

  console.log('')
  console.log('Codex Web running:')
  console.log(`  UI: ${webUrl}`)
  console.log(`  Backend: ${backendUrl}`)
  console.log('')

  if (options.open) {
    openUrl(webUrl)
  }

  const shutdown = () => {
    backend.kill()
    web.kill()
  }

  process.on('SIGINT', () => {
    shutdown()
    process.exit(0)
  })

  const [firstExit] = await Promise.race([
    backend.exited.then((code) => ['backend', code] as const),
    web.exited.then((code) => ['web', code] as const),
  ])

  shutdown()
  const [, exitCode] = firstExit
  process.exit(exitCode ?? 0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
