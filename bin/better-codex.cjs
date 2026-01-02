#!/usr/bin/env node
/* eslint-disable no-console */
const { spawn, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { randomUUID } = require('node:crypto');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightCyan: '\x1b[96m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightMagenta: '\x1b[95m',
};

const symbols = {
  tick: '✔',
  cross: '✖',
  pointer: '▶',
  dot: '●',
  line: '─',
  arrow: '→',
  rocket: '◆',
  sparkles: '✦',
  globe: '◎',
  server: '⚡',
  info: 'ℹ',
};

const BANNER = `
${c.brightCyan}${c.bold}    ____       __  __              ______          __         
   / __ )___  / /_/ /____  _____  / ____/___  ____/ /__  _  __
  / __  / _ \\/ __/ __/ _ \\/ ___/ / /   / __ \\/ __  / _ \\| |/_/
 / /_/ /  __/ /_/ /_/  __/ /    / /___/ /_/ / /_/ /  __/>  <  
/_____/\\___/\\__/\\__/\\___/_/     \\____/\\____/\\__,_/\\___/_/|_|  
${c.reset}
${c.dim}${c.italic}    A modern web interface for Codex${c.reset}
`;

const log = {
  info: (msg) => console.log(`${c.cyan}${symbols.info}${c.reset} ${msg}`),
  success: (msg) => console.log(`${c.green}${symbols.tick}${c.reset} ${msg}`),
  warn: (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`),
  error: (msg) => console.log(`${c.red}${symbols.cross}${c.reset} ${msg}`),
  step: (msg) => console.log(`${c.magenta}${symbols.pointer}${c.reset} ${msg}`),
  dim: (msg) => console.log(`${c.dim}  ${msg}${c.reset}`),
};

const box = (lines, color = c.cyan) => {
  // Calculate display width (ANSI codes = 0 width)
  const displayWidth = (str) => str.replace(/\x1b\[[0-9;]*m/g, '').length;

  const maxLen = Math.max(...lines.map(displayWidth));
  const top = `${color}╭${'─'.repeat(maxLen + 2)}╮${c.reset}`;
  const bottom = `${color}╰${'─'.repeat(maxLen + 2)}╯${c.reset}`;
  const padded = lines.map((l) => {
    const width = displayWidth(l);
    return `${color}│${c.reset} ${l}${' '.repeat(maxLen - width)} ${color}│${c.reset}`;
  });
  return [top, ...padded, bottom].join('\n');
};

const DEFAULTS = {
  host: '127.0.0.1',
  backendPort: 7711,
  webPort: 5173,
  open: false,
};

const printHelp = () => {
  console.log(BANNER);
  console.log(`${c.bold}USAGE${c.reset}`);
  console.log(`  ${c.cyan}better-codex${c.reset} ${c.dim}[command]${c.reset} ${c.dim}[options]${c.reset}`);
  console.log('');
  console.log(`${c.bold}COMMANDS${c.reset}`);
  console.log(`  ${c.green}web${c.reset}       Start the web interface ${c.dim}(default)${c.reset}`);
  console.log('');
  console.log(`${c.bold}OPTIONS${c.reset}`);
  console.log(`  ${c.yellow}--root${c.reset} ${c.dim}<path>${c.reset}         Path to project root`);
  console.log(`  ${c.yellow}--host${c.reset} ${c.dim}<host>${c.reset}         Host to bind ${c.dim}(default: 127.0.0.1)${c.reset}`);
  console.log(`  ${c.yellow}--backend-port${c.reset} ${c.dim}<n>${c.reset}   Backend port ${c.dim}(default: 7711)${c.reset}`);
  console.log(`  ${c.yellow}--web-port${c.reset} ${c.dim}<n>${c.reset}       Web UI port ${c.dim}(default: 5173)${c.reset}`);
  console.log(`  ${c.yellow}--open${c.reset}                Open browser automatically`);
  console.log(`  ${c.yellow}--help, -h${c.reset}            Show this help message`);
  console.log('');
  console.log(`${c.bold}EXAMPLES${c.reset}`);
  console.log(`  ${c.dim}$${c.reset} better-codex`);
  console.log(`  ${c.dim}$${c.reset} better-codex web --open`);
  console.log(`  ${c.dim}$${c.reset} better-codex --host 0.0.0.0 --web-port 3000`);
  console.log('');
};

const parseArgs = () => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const options = { ...DEFAULTS, root: undefined };
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'web';
  const flagArgs = command === args[0] ? args.slice(1) : args;

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
    log.error(`Unknown option: ${c.yellow}${arg}${c.reset}`);
    console.log(`Run ${c.cyan}better-codex --help${c.reset} for usage.`);
    process.exit(1);
  }

  return { command, options };
};

const isRoot = (dir) =>
  existsSync(join(dir, 'apps', 'backend', 'package.json')) &&
  existsSync(join(dir, 'apps', 'web', 'package.json'));

const findRoot = (explicit) => {
  if (explicit) {
    const resolved = resolve(explicit);
    if (isRoot(resolved)) {
      return resolved;
    }
    throw new Error(`Specified root does not contain apps/: ${explicit}`);
  }

  let current = resolve(process.cwd());
  for (let depth = 0; depth < 8; depth += 1) {
    if (isRoot(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const bundledRoot = resolve(dirname(__filename), '..');
  if (isRoot(bundledRoot)) {
    return bundledRoot;
  }

  const npmGlobalRoot = resolve(dirname(__filename), '..', '..');
  const npmPackageRoot = join(npmGlobalRoot, 'better-codex');
  if (isRoot(npmPackageRoot)) {
    return npmPackageRoot;
  }

  throw new Error(
    `Could not locate Better Codex apps.\n` +
      `The bundled apps may be missing. Try reinstalling:\n` +
      `  ${c.cyan}npm install -g better-codex${c.reset}`
  );
};

const ensureBun = () => {
  const result = spawnSync('bun', ['--version'], { stdio: 'pipe' });
  if (result.status !== 0) {
    console.log('');
    log.error(`${c.bold}Bun is required but not installed${c.reset}`);
    console.log('');
    console.log(`  Install Bun: ${c.cyan}${c.underline}https://bun.sh${c.reset}`);
    console.log('');
    console.log(`  ${c.dim}# Quick install:${c.reset}`);
    console.log(`  ${c.dim}$${c.reset} curl -fsSL https://bun.sh/install | bash`);
    console.log('');
    process.exit(1);
  }
  const version = result.stdout?.toString().trim() || 'unknown';
  return version;
};

const ensureDeps = (cwd, name) => {
  const nodeModules = join(cwd, 'node_modules');
  if (existsSync(nodeModules)) {
    return true;
  }
  log.step(`Installing dependencies for ${c.cyan}${name}${c.reset}...`);
  const result = spawnSync('bun', ['install'], { cwd, stdio: 'ignore' });
  if (result.status !== 0) {
    log.error(`Failed to install dependencies in ${cwd}`);
    process.exit(1);
  }
  log.success(`Dependencies installed for ${c.cyan}${name}${c.reset}`);
  return true;
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
  console.log(BANNER);

  const bunVersion = ensureBun();
  log.success(`Bun ${c.dim}v${bunVersion}${c.reset}`);

  const root = findRoot(options.root);
  log.success(`Project root: ${c.dim}${root}${c.reset}`);

  const backendDir = join(root, 'apps', 'backend');
  const webDir = join(root, 'apps', 'web');
  const token = randomUUID();
  const backendUrl = `http://${options.host}:${options.backendPort}`;
  const webUrl = `http://${options.host}:${options.webPort}`;

  console.log('');

  ensureDeps(backendDir, 'backend');
  ensureDeps(webDir, 'web');

  console.log('');
  log.step(`Starting servers...`);
  console.log('');

  const backend = spawn('bun', ['run', 'dev'], {
    cwd: backendDir,
    env: {
      ...process.env,
      CODEX_HUB_HOST: options.host,
      CODEX_HUB_PORT: String(options.backendPort),
      CODEX_HUB_TOKEN: token,
      CODEX_HUB_DEFAULT_CWD: process.cwd(),
    },
    stdio: 'pipe',
    detached: false,
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
      stdio: 'pipe',
      detached: false,
    }
  );

  backend.stdout?.resume();
  backend.stderr?.resume();
  web.stdout?.resume();
  web.stderr?.resume();

  setTimeout(() => {
    console.log('');
    console.log(
      box(
        [
          `${c.bold}Better Codex is running${c.reset}`,
          '',
          `  Web UI    ${c.cyan}${c.underline}${webUrl}${c.reset}`,
          `  Backend   ${c.dim}${backendUrl}${c.reset}`,
          '',
          `  ${c.dim}Press ${c.reset}${c.bold}Ctrl+C${c.reset}${c.dim} to stop${c.reset}`,
        ],
        c.green
      )
    );
    console.log('');

    if (options.open) {
      log.info(`Opening browser...`);
      openUrl(webUrl);
    }
  }, 1500);

  const shutdown = () => {
    console.log('');
    log.info('Shutting down...');
    backend.kill();
    web.kill();
  };

  process.on('SIGINT', () => {
    shutdown();
    log.success('Goodbye! 👋');
    console.log('');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });

  const onExit = (name) => (code) => {
    if (code !== 0 && code !== null) {
      log.error(`${name} exited with code ${code}`);
    }
    shutdown();
    process.exit(code ?? 0);
  };

  backend.on('exit', onExit('Backend'));
  web.on('exit', onExit('Web'));
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
