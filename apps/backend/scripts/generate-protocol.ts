import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadConfig } from '../src/config'

const config = loadConfig()
const outDir = join(process.cwd(), 'src', 'protocol')

await mkdir(outDir, { recursive: true })

const args = [
  ...config.codexArgs,
  'app-server',
  'generate-ts',
  '--out',
  outDir,
]

const child = spawn(config.codexBin, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
  },
})

const exitCode = await new Promise<number>((resolve) => {
  child.on('exit', (code) => resolve(code ?? 1))
})

if (exitCode !== 0) {
  process.exit(exitCode)
}
