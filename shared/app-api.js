(function () {
  const hasDesktopBridge = Boolean(window.api || window.auth || window.users);

  const desktopAdapter = window.__desktopAdapter || null;
  const webAdapter = window.__webAdapter || null;

  const adapter = hasDesktopBridge ? desktopAdapter : webAdapter;

  if (!adapter) {
    throw new Error('Nenhum adapter disponivel. Carregue shared/adapters/desktop-adapter.js e shared/adapters/web-adapter.js antes.');
  }

  window.appApi = adapter;
})();
