const registerSystemHandlers = ({ ipcMain, shell }) => {
  ipcMain.handle('system-open-external-url', async (_event, rawUrl) => {
    const value = String(rawUrl || '').trim();
    if (!value) {
      throw new Error('URL externa inválida.');
    }

    let parsed;
    try {
      parsed = new URL(value);
    } catch (_err) {
      throw new Error('URL externa inválida.');
    }

    if (parsed.protocol !== 'https:') {
      throw new Error('Apenas URLs https são permitidas.');
    }

    await shell.openExternal(parsed.toString());
    return { success: true };
  });
};

module.exports = { registerSystemHandlers };
