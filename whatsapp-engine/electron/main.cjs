const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

if (!app || typeof app.whenReady !== 'function') {
  console.error('[electron] bootstrap incompatível: Electron app indisponível neste processo.');
  process.exit(1);
}

const ENGINE_URL = process.env.WHATSAPP_ENGINE_APP_URL || 'http://127.0.0.1:8099';
const ADMIN_URL = `${ENGINE_URL.replace(/\/$/, '')}/admin/login`;
const READINESS_URL = ADMIN_URL;

let mainWindow = null;
let bootTimer = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#091019',
    title: 'Voithos WhatsApp NG',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const normalizedEngineUrl = ENGINE_URL.replace(/\/$/, '');
    if (url.startsWith(normalizedEngineUrl)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const pingAdminLogin = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(READINESS_URL, {
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const bootAdmin = async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const healthy = await pingAdminLogin();
  if (!healthy) {
    if (bootTimer) clearTimeout(bootTimer);
    bootTimer = setTimeout(bootAdmin, 1200);
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(ADMIN_URL).catch(() => {
    if (bootTimer) clearTimeout(bootTimer);
    bootTimer = setTimeout(bootAdmin, 1200);
  });
};

app.whenReady().then(() => {
  createWindow();
  void bootAdmin();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      void bootAdmin();
    }
  });
});

app.on('window-all-closed', () => {
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
