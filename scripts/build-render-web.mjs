import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, 'render-static');
const configFileName = 'runtime-config.js';
const releaseInfoFileName = 'voithos-release.json';
const apiBase = String(
  process.env.WEB_CENTRAL_BACKEND_BASE_URL ||
  process.env.CENTRAL_BACKEND_BASE_URL ||
  process.env.PUBLIC_APP_API_BASE_URL ||
  ''
).trim().replace(/\/+$/, '');

const rootExtensions = new Set([
  '.html',
  '.js',
  '.css',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.ico',
  '.webmanifest',
]);

const publicRootFiles = new Set([
  'Procedimentos.json',
]);

const copyDirectories = [
  'assets',
  'shared',
  'cards imagens',
];

const ensureDir = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};

const copyFile = async (sourcePath, targetPath) => {
  await ensureDir(path.dirname(targetPath));
  await fs.copyFile(sourcePath, targetPath);
};

const copyDirectory = async (sourceDir, targetDir) => {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  await ensureDir(targetDir);
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }
    await copyFile(sourcePath, targetPath);
  }
};

const injectRuntimeConfig = (html) => {
  if (html.includes(configFileName)) return html;
  const snippet = `  <script src="./${configFileName}"></script>\n`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${snippet}</head>`);
  }
  return `${snippet}${html}`;
};

const writeRuntimeConfig = async () => {
  const targetPath = path.join(outDir, configFileName);
  const contents = [
    'window.__APP_API_BASE__ = ' + JSON.stringify(apiBase) + ';',
    'window.__VOITHOS_DEPLOY_TARGET__ = "render";',
  ].join('\n');
  await fs.writeFile(targetPath, `${contents}\n`, 'utf8');
};

const writeReleaseInfo = async () => {
  const targetPath = path.join(outDir, releaseInfoFileName);
  const payload = {
    app: 'voithos-web',
    deployTarget: 'render',
    generatedAt: new Date().toISOString(),
    gitCommit: String(process.env.RENDER_GIT_COMMIT || '').trim() || null,
    gitBranch: String(process.env.RENDER_GIT_BRANCH || '').trim() || null,
    renderServiceName: String(process.env.RENDER_SERVICE_NAME || '').trim() || null,
    renderExternalUrl: String(process.env.RENDER_EXTERNAL_URL || '').trim() || null,
    apiBase: apiBase || null,
  };
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const copyRootFiles = async () => {
  const entries = await fs.readdir(repoRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!rootExtensions.has(ext) && !publicRootFiles.has(entry.name)) continue;
    const sourcePath = path.join(repoRoot, entry.name);
    const targetPath = path.join(outDir, entry.name);
    if (ext === '.html') {
      const raw = await fs.readFile(sourcePath, 'utf8');
      await fs.writeFile(targetPath, injectRuntimeConfig(raw), 'utf8');
      continue;
    }
    await copyFile(sourcePath, targetPath);
  }
};

const main = async () => {
  if (!apiBase) {
    console.warn('[render-web] WEB_CENTRAL_BACKEND_BASE_URL is empty. The deployed webapp will require manual API base configuration.');
  }

  await fs.rm(outDir, { recursive: true, force: true });
  await ensureDir(outDir);

  await copyRootFiles();
  for (const dir of copyDirectories) {
    const sourceDir = path.join(repoRoot, dir);
    const targetDir = path.join(outDir, dir);
    await copyDirectory(sourceDir, targetDir);
  }
  await writeRuntimeConfig();
  await writeReleaseInfo();

  console.log('[render-web] static package generated at', outDir);
};

main().catch((error) => {
  console.error('[render-web] build failed', error);
  process.exitCode = 1;
});
