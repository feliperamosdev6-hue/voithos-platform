const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const keepClinicId = String(process.argv[2] || '').trim();
const execute = process.argv.includes('--execute');

if (!keepClinicId) {
  throw new Error('Informe o clinicId a preservar. Ex.: node scripts/reset-local-userdata-keep-clinic.js <clinicId> [--execute]');
}

const userDataPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'voithos-app');
const clinicRoot = path.join(userDataPath, 'CLINICA');
const clinicByClinicRoot = path.join(clinicRoot, 'by-clinic');
const clinicLogsRoot = path.join(clinicRoot, 'logs');
const sessionFile = path.join(userDataPath, 'USERS', 'session.json');

const cacheDirs = [
  path.join(userDataPath, 'PACIENTES'),
  path.join(userDataPath, 'AGENDA'),
  path.join(userDataPath, 'FINANCEIRO'),
  path.join(userDataPath, 'SERVICOS'),
];

const copyRecursive = async (source, target) => {
  const stat = await fsp.stat(source);
  if (stat.isDirectory()) {
    await fsp.mkdir(target, { recursive: true });
    const entries = await fsp.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(path.join(source, entry.name), path.join(target, entry.name));
    }
    return;
  }

  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.copyFile(source, target);
};

const listExisting = async (dirPath) => {
  try {
    return await fsp.readdir(dirPath, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
};

const safeReadJson = async (filePath) => {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
};

async function buildPlan() {
  const clinicDirs = await listExisting(clinicByClinicRoot);
  const staleClinicDirs = clinicDirs
    .filter((entry) => entry.isDirectory() && entry.name !== keepClinicId)
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(clinicByClinicRoot, entry.name),
    }));

  const logEntries = await listExisting(clinicLogsRoot);
  const staleLogFiles = logEntries
    .filter((entry) => entry.isFile() && /^messaging-(.+)\.json$/i.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(clinicLogsRoot, entry.name),
      clinicId: entry.name.replace(/^messaging-/i, '').replace(/\.json$/i, ''),
    }))
    .filter((entry) => entry.clinicId !== keepClinicId);

  const session = await safeReadJson(sessionFile);
  const cacheDirDetails = await Promise.all(cacheDirs.map(async (dirPath) => {
    const entries = await listExisting(dirPath);
    return {
      path: dirPath,
      exists: entries.length > 0 || fs.existsSync(dirPath),
      entryCount: entries.length,
    };
  }));

  return {
    generatedAt: new Date().toISOString(),
    userDataPath,
    keepClinicId,
    staleClinicDirs,
    staleLogFiles,
    sessionFile: fs.existsSync(sessionFile) ? {
      path: sessionFile,
      clinicId: String(session?.clinicId || '').trim(),
      shouldClear: true,
    } : null,
    cacheDirs: cacheDirDetails,
  };
}

async function executePlan(plan) {
  const backupDir = path.resolve(
    __dirname,
    '..',
    'backups',
    `local-userdata-reset-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );
  await fsp.mkdir(backupDir, { recursive: true });

  for (const item of plan.staleClinicDirs) {
    if (fs.existsSync(item.fullPath)) {
      await copyRecursive(item.fullPath, path.join(backupDir, 'CLINICA', 'by-clinic', item.name));
      await fsp.rm(item.fullPath, { recursive: true, force: true });
    }
  }

  for (const item of plan.staleLogFiles) {
    if (fs.existsSync(item.fullPath)) {
      await copyRecursive(item.fullPath, path.join(backupDir, 'CLINICA', 'logs', item.name));
      await fsp.rm(item.fullPath, { force: true });
    }
  }

  if (plan.sessionFile?.path && fs.existsSync(plan.sessionFile.path)) {
    await copyRecursive(plan.sessionFile.path, path.join(backupDir, 'USERS', 'session.json'));
    await fsp.rm(plan.sessionFile.path, { force: true });
  }

  for (const cacheDir of plan.cacheDirs) {
    if (!fs.existsSync(cacheDir.path)) continue;
    const dirName = path.basename(cacheDir.path);
    await copyRecursive(cacheDir.path, path.join(backupDir, dirName));
    await fsp.rm(cacheDir.path, { recursive: true, force: true });
    await fsp.mkdir(cacheDir.path, { recursive: true });
  }

  return {
    backupDir,
  };
}

async function main() {
  const plan = await buildPlan();
  if (!execute) {
    console.log(JSON.stringify({ mode: 'dry-run', ...plan }, null, 2));
    return;
  }

  const result = await executePlan(plan);
  const finalPlan = await buildPlan();
  console.log(JSON.stringify({
    mode: 'execute',
    ...result,
    finalState: finalPlan,
  }, null, 2));
}

main().catch((error) => {
  console.error('RESET_LOCAL_USERDATA_KEEP_CLINIC_ERROR');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
