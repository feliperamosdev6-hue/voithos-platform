import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const isWindows = process.platform === 'win32';

const candidates = [
  resolve(rootDir, 'node_modules', 'electron', 'dist', isWindows ? 'electron.exe' : 'electron'),
  resolve(rootDir, '..', 'node_modules', 'electron', 'dist', isWindows ? 'electron.exe' : 'electron'),
];

const electronBinaryPath = candidates.find((candidate) => existsSync(candidate));

if (!electronBinaryPath) {
  console.error('[electron] Nao foi possivel localizar o Electron.');
  console.error('[electron] Instale `electron` na raiz do repositorio ou no proprio whatsapp-engine.');
  process.exit(1);
}

const child = spawn(electronBinaryPath, [resolve(rootDir, 'electron', 'main.cjs')], {
  cwd: rootDir,
  env: {
    ...process.env,
    WHATSAPP_ENGINE_BOOT_MODE: process.env.WHATSAPP_ENGINE_BOOT_MODE || 'ui',
  },
  stdio: 'inherit',
  windowsHide: false,
});

const shutdown = (signal = 'SIGTERM') => {
  if (!child.killed) {
    try {
      child.kill(signal);
    } catch {
      // Ignora erros de desligamento para encerrar o processo pai.
    }
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
