#!/usr/bin/env node

import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import path from 'node:path';

const rootDir = process.cwd();
const ngDir = path.join(rootDir, 'whatsapp-engine');
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const commandShell = isWindows ? (process.env.ComSpec || 'cmd.exe') : null;

function parseArgs(argv) {
  const args = {
    clinicIds: [],
    keepRunning: true,
    skipSmoke: false,
    backendPort: 4000,
    ngPort: 8099,
  };

  for (const raw of argv) {
    if (raw === '--no-smoke') {
      args.skipSmoke = true;
      continue;
    }
    if (raw === '--no-keep-running') {
      args.keepRunning = false;
      continue;
    }
    if (raw.startsWith('--clinicId=')) {
      const clinicId = raw.slice('--clinicId='.length).trim();
      if (clinicId) args.clinicIds.push(clinicId);
      continue;
    }
    if (raw.startsWith('--backendPort=')) {
      const port = Number(raw.slice('--backendPort='.length));
      if (Number.isFinite(port) && port > 0) args.backendPort = port;
      continue;
    }
    if (raw.startsWith('--ngPort=')) {
      const port = Number(raw.slice('--ngPort='.length));
      if (Number.isFinite(port) && port > 0) args.ngPort = port;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnectToPort(port, host = '127.0.0.1', timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function fetchReady(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHealth({ label, port, urls, timeoutMs = 120000 }) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    const portOpen = await canConnectToPort(port);
    if (portOpen) {
      for (const url of urls) {
        if (await fetchReady(url)) {
          process.stdout.write(`[bootstrap] ${label} pronto em ${url}\n`);
          return true;
        }
      }
    }
    await sleep(1500);
  }
  return false;
}

function spawnScript({ cwd, script, label, env = {} }) {
  const child = isWindows
    ? spawn(commandShell, ['/d', '/s', '/c', `${npmCommand} run ${script}`], {
        cwd,
        env: {
          ...process.env,
          ...env,
        },
        stdio: 'inherit',
        windowsHide: false,
      })
    : spawn(npmCommand, ['run', script], {
        cwd,
        env: {
          ...process.env,
          ...env,
        },
        stdio: 'inherit',
        windowsHide: false,
      });

  child.on('error', (error) => {
    process.stderr.write(`[bootstrap] falha ao iniciar ${label}: ${error.message}\n`);
  });

  return child;
}

async function runSmoke(clinicIds) {
  return new Promise((resolve) => {
    const args = ['scripts/smoke-voithos-platform.mjs', '--strict', ...clinicIds.map((clinicId) => `--clinicId=${clinicId}`)];
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
      windowsHide: false,
    });

    child.once('exit', (code) => resolve(code ?? 1));
    child.once('error', () => resolve(1));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const children = [];

  const backendReady = await fetchReady(`http://127.0.0.1:${args.backendPort}/health`) || await fetchReady(`http://127.0.0.1:${args.backendPort}/api/health`);
  if (!backendReady) {
    process.stdout.write('[bootstrap] iniciando backend central...\n');
    children.push(spawnScript({ cwd: rootDir, script: 'backend:start', label: 'backend central' }));
  } else {
    process.stdout.write('[bootstrap] backend central ja estava ativo.\n');
  }

  const ngReady = await fetchReady(`http://127.0.0.1:${args.ngPort}/health`);
  if (!ngReady) {
    process.stdout.write('[bootstrap] iniciando WhatsApp NG headless...\n');
    children.push(spawnScript({ cwd: ngDir, script: 'start:all:headless', label: 'WhatsApp NG headless' }));
  } else {
    process.stdout.write('[bootstrap] WhatsApp NG ja estava ativo.\n');
  }

  const shutdown = () => {
    for (const child of children) {
      if (!child.killed) {
        try {
          child.kill('SIGTERM');
        } catch {
          // noop
        }
      }
    }
  };

  process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });

  const backendOk = await waitForHealth({
    label: 'Backend central',
    port: args.backendPort,
    urls: [
      `http://127.0.0.1:${args.backendPort}/health`,
      `http://127.0.0.1:${args.backendPort}/api/health`,
    ],
  });
  if (!backendOk) {
    process.stderr.write('[bootstrap] backend central nao respondeu dentro do tempo limite.\n');
    shutdown();
    process.exit(1);
  }

  const ngOk = await waitForHealth({
    label: 'WhatsApp NG',
    port: args.ngPort,
    urls: [`http://127.0.0.1:${args.ngPort}/health`],
  });
  if (!ngOk) {
    process.stderr.write('[bootstrap] WhatsApp NG nao respondeu dentro do tempo limite.\n');
    shutdown();
    process.exit(1);
  }

  if (!args.skipSmoke) {
    process.stdout.write('[bootstrap] executando smoke da plataforma...\n');
    const smokeExitCode = await runSmoke(args.clinicIds);
    if (smokeExitCode !== 0) {
      process.stderr.write(`[bootstrap] smoke da plataforma falhou com codigo ${smokeExitCode}.\n`);
      shutdown();
      process.exit(smokeExitCode);
    }
  }

  process.stdout.write('[bootstrap] plataforma pronta.\n');
  if (!args.keepRunning) {
    shutdown();
    process.exit(0);
  }

  process.stdout.write('[bootstrap] mantendo backend e NG ativos. Use Ctrl+C para encerrar.\n');
}

main().catch((error) => {
  process.stderr.write(`[bootstrap] falha fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
