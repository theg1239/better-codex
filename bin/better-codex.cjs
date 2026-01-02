#!/usr/bin/env node
/* eslint-disable no-console */
const { spawn, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULTS = {
  host: '127.0.0.1',
  backendPort: 7711,
  webPort: 5173,
  open: false,
};

const printHelp = () => {
  console.log(`better-codex

Usage:
  better-codex web [--root PATH] [--host 127.0.0.1] [--backend-port 7711] [--web-port 5173] [--open]
`);
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = { ...DEFAULTS, root: undefined };
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'web';
  const flagArgs = command === 'web' ? args.slice(1) : args;

  for (let i = 0; i < flagArgs.length; i += 1) {
    const arg = flagArgs[i];
    if (arg === '--root') {
      options.root = flagArgs[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--host') {
      options.host = flagArgs[i + 1] ?? DEFAULTS.host;
      i += 1;
      continue;
    }
    if (arg === '--backend-port') {
      options.backendPort = Number(flagArgs[i + 1] ?? DEFAULTS.backendPort);
      i += 1;
      continue;
    }
    if (arg === '--web-port') {
      options.webPort = Number(flagArgs[i + 1] ?? DEFAULTS.webPort);
      i += 1;
      continue;
    }
    if (arg === '--open') {
      options.open = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    console.error(`Unknown option: ${arg}`);
    printHelp();
    process.exit(1);
  }

  return { command, options };
};

const findRoot = (explicit) => {
  let current = resolve(explicit ?? process.cwd());
  for (let depth = 0; depth < 8; depth += 1) {
    if (isRoot(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error(
    'Could not locate. Run from the repo root or pass --root.'
  );
};

const isRoot = (dir) =>
  existsSync(join(dir, 'apps', 'backend', 'package.json')) &&
  existsSync(join(dir, 'apps', 'web', 'package.json'));

const ensureBun = () => {
  const result = spawnSync('bun', ['--version'], { stdio: 'ignore' });
  if (result.status !== 0) {
    throw new Error('bun is required. Install it first: https://bun.sh');
  }
};

const ensureDeps = (cwd) => {
  const nodeModules = join(cwd, 'node_modules');
  if (existsSync(nodeModules)) {
    return;
  }
  const result = spawnSync('bun', ['install'], { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`bun install failed in ${cwd}`);
  }
};

const openUrl = (url) => {
  const platform = process.platform;
  const cmd =
    platform === 'darwin'
      ? ['open', url]
      : platform === 'win32'
        ? ['cmd', '/C', 'start', url]
        : ['xdg-open', url];
  spawn(cmd[0], cmd.slice(1), { stdio: 'ignore' });
};

const runWeb = (options) => {
  ensureBun();
  const root = findRoot(options.root);
  const backendDir = join(root, 'apps', 'backend');
  const webDir = join(root, 'apps', 'web');
  const token = randomUUID();
  const backendUrl = `http://${options.host}:${options.backendPort}`;
  const webUrl = `http://${options.host}:${options.webPort}`;

  ensureDeps(backendDir);
  ensureDeps(webDir);

  const backend = spawn('bun', ['run', 'dev'], {
    cwd: backendDir,
    env: {
      ...process.env,
      CODEX_HUB_HOST: options.host,
      CODEX_HUB_PORT: String(options.backendPort),
      CODEX_HUB_TOKEN: token,
      CODEX_HUB_DEFAULT_CWD: root,
    },
    stdio: 'inherit',
  });

  const web = spawn(
    'bun',
    ['run', 'dev', '--', '--host', options.host, '--port', String(options.webPort)],
    {
      cwd: webDir,
      env: {
        ...process.env,
        VITE_CODEX_HUB_URL: backendUrl,
        VITE_CODEX_HUB_TOKEN: token,
      },
      stdio: 'inherit',
    }
  );

  console.log('');
  console.log('Codex Web running:');
  console.log(`  UI: ${webUrl}`);
  console.log(`  Backend: ${backendUrl}`);
  console.log('');

  if (options.open) {
    openUrl(webUrl);
  }

  const shutdown = () => {
    backend.kill();
    web.kill();
  };

  process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });

  const onExit = (name) => (code) => {
    console.error(`${name} exited with code ${code}`);
    shutdown();
    process.exit(code ?? 0);
  };

  backend.on('exit', onExit('backend'));
  web.on('exit', onExit('web'));
};

const main = () => {
  const { command, options } = parseArgs();
  if (command !== 'web') {
    printHelp();
    process.exit(1);
  }
  runWeb(options);
};

main();
