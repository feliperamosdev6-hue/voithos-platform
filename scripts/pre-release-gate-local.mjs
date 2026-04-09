#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';

const rootDir = process.cwd();
const ngDir = path.join(rootDir, 'whatsapp-engine');
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const npxCommand = isWindows ? 'npx.cmd' : 'npx';
const commandShell = isWindows ? (process.env.ComSpec || 'cmd.exe') : null;

function parseArgs(argv) {
  const args = {
    clinicIds: [],
    skipSyntax: false,
    skipDoctor: false,
    skipBuild: false,
    skipBootstrap: false,
  };

  for (const raw of argv) {
    if (raw === '--skip-syntax') {
      args.skipSyntax = true;
      continue;
    }
    if (raw === '--skip-doctor') {
      args.skipDoctor = true;
      continue;
    }
    if (raw === '--skip-build') {
      args.skipBuild = true;
      continue;
    }
    if (raw === '--skip-bootstrap') {
      args.skipBootstrap = true;
      continue;
    }
    if (raw.startsWith('--clinicId=')) {
      const clinicId = raw.slice('--clinicId='.length).trim();
      if (clinicId) args.clinicIds.push(clinicId);
    }
  }

  return args;
}

function runCommand({ command, args, cwd, label }) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`[gate] ${label}\n`);
    const child = isWindows && (command === npmCommand || command === npxCommand)
      ? spawn(commandShell, ['/d', '/s', '/c', `${command} ${args.join(' ')}`], {
          cwd,
          env: process.env,
          stdio: 'inherit',
          windowsHide: false,
        })
      : spawn(command, args, {
          cwd,
          env: process.env,
          stdio: 'inherit',
          windowsHide: false,
        });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} falhou com codigo ${code ?? 'desconhecido'}.`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const clinicArgs = args.clinicIds.map((clinicId) => `--clinicId=${clinicId}`);

  if (!args.skipSyntax) {
    await runCommand({
      command: process.execPath,
      args: ['--check', 'scripts/doctor-voithos-local.mjs'],
      cwd: rootDir,
      label: 'Validando sintaxe do doctor local',
    });
    await runCommand({
      command: process.execPath,
      args: ['--check', 'scripts/bootstrap-voithos-local.mjs'],
      cwd: rootDir,
      label: 'Validando sintaxe do bootstrap local',
    });
    await runCommand({
      command: process.execPath,
      args: ['--check', 'scripts/smoke-voithos-platform.mjs'],
      cwd: rootDir,
      label: 'Validando sintaxe do smoke da plataforma',
    });
    await runCommand({
      command: process.execPath,
      args: ['--check', 'scripts/pre-release-gate-local.mjs'],
      cwd: rootDir,
      label: 'Validando sintaxe do gate local',
    });
  }

  if (!args.skipDoctor) {
    await runCommand({
      command: npmCommand,
      args: ['run', 'doctor:platform:local'],
      cwd: rootDir,
      label: 'Executando doctor da plataforma',
    });
  }

  if (!args.skipBuild) {
    await runCommand({
      command: npxCommand,
      args: ['tsc', '-p', 'whatsapp-engine/tsconfig.json', '--noEmit'],
      cwd: rootDir,
      label: 'Validando TypeScript do WhatsApp NG',
    });
    await runCommand({
      command: npmCommand,
      args: ['run', 'build'],
      cwd: ngDir,
      label: 'Gerando build do WhatsApp NG',
    });
  }

  if (!args.skipBootstrap) {
    await runCommand({
      command: npmCommand,
      args: ['run', 'bootstrap:platform:local', '--', '--no-keep-running', ...clinicArgs],
      cwd: rootDir,
      label: 'Executando bootstrap e smoke da plataforma',
    });
  }

  process.stdout.write('[gate] pre-release gate local aprovado.\n');
}

main().catch((error) => {
  process.stderr.write(`[gate] falha: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
