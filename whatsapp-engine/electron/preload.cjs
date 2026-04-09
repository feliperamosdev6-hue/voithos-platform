const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('voithosDesktop', {
  appName: 'Voithos WhatsApp NG',
  platform: process.platform,
});
