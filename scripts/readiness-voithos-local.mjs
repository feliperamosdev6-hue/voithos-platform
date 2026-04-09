#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function canConnectToPort(port, host = '127.0.0.1', timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function scoreToStatus(score, total) {
  if (score === total) return 'OK';
  if (score > 0) return 'WARN';
  return 'FAIL';
}

function printSection(title, status, details) {
  process.stdout.write(`\n[${status}] ${title}\n`);
  for (const detail of details) {
    process.stdout.write(` - ${detail}\n`);
  }
}

async function main() {
  const artifactChecks = [
    ['Doctor local', exists('scripts/doctor-voithos-local.mjs')],
    ['Bootstrap local', exists('scripts/bootstrap-voithos-local.mjs')],
    ['Smoke da plataforma', exists('scripts/smoke-voithos-platform.mjs')],
    ['Gate local', exists('scripts/pre-release-gate-local.mjs')],
  ];

  const docsChecks = [
    ['Checklist da plataforma', exists('CHECKLIST-RELEASE-PLATAFORMA-VOITHOS.md')],
    ['Checklist do NG', exists('whatsapp-engine/CHECKLIST-RELEASE-NG.md')],
    ['Runbook NG onboarding/offboarding', exists('whatsapp-engine/RUNBOOK-ONBOARDING-E-DESPROVISIONAMENTO.md')],
    ['Playbook de suporte multi-clinica', exists('PLAYBOOK-SUPORTE-MULTICLINICA-VOITHOS.md')],
  ];

  const envChecks = [
    ['.env raiz', exists('.env')],
    ['.env do WhatsApp NG', exists('whatsapp-engine/.env')],
  ];

  const portChecks = [
    ['Postgres local (5433)', await canConnectToPort(5433)],
    ['Redis local (6379)', await canConnectToPort(6379)],
    ['Backend central (4000)', await canConnectToPort(4000)],
    ['WhatsApp NG (8099)', await canConnectToPort(8099)],
  ];

  const artifactScore = artifactChecks.filter(([, ok]) => ok).length;
  const docsScore = docsChecks.filter(([, ok]) => ok).length;
  const envScore = envChecks.filter(([, ok]) => ok).length;
  const portScore = portChecks.filter(([, ok]) => ok).length;

  printSection(
    'Ferramentas operacionais locais',
    scoreToStatus(artifactScore, artifactChecks.length),
    artifactChecks.map(([label, ok]) => `${ok ? 'OK' : 'FALTA'} ${label}`),
  );

  printSection(
    'Documentacao operacional',
    scoreToStatus(docsScore, docsChecks.length),
    docsChecks.map(([label, ok]) => `${ok ? 'OK' : 'FALTA'} ${label}`),
  );

  printSection(
    'Configuracao local',
    scoreToStatus(envScore, envChecks.length),
    envChecks.map(([label, ok]) => `${ok ? 'OK' : 'FALTA'} ${label}`),
  );

  printSection(
    'Infraestrutura local',
    scoreToStatus(portScore, portChecks.length),
    portChecks.map(([label, ok]) => `${ok ? 'ONLINE' : 'OFFLINE'} ${label}`),
  );

  process.stdout.write('\nResumo executivo\n');
  process.stdout.write(` - Operacao local: ${scoreToStatus(artifactScore, artifactChecks.length)}\n`);
  process.stdout.write(` - Documentacao: ${scoreToStatus(docsScore, docsChecks.length)}\n`);
  process.stdout.write(` - Configuracao: ${scoreToStatus(envScore, envChecks.length)}\n`);
  process.stdout.write(` - Runtime local: ${scoreToStatus(portScore, portChecks.length)}\n`);

  process.stdout.write('\nProximos comandos\n');
  process.stdout.write(' - cmd /c npm run doctor:platform:local\n');
  process.stdout.write(' - cmd /c npm run bootstrap:platform:local -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95\n');
  process.stdout.write(' - cmd /c npm run gate:platform:local -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95\n');
}

main().catch((error) => {
  process.stderr.write(`FAIL readiness.platform: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
