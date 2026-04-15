(function () {
  // Detectar ambiente verificando especificamente se desktop adapter foi criado
  // Em vez de confiar em window.api/auth/users que podem vir de outras libs
  const hasDesktopBridge = typeof window.__desktopAdapter !== 'undefined' && window.__desktopAdapter !== null;

  const desktopAdapter = window.__desktopAdapter || null;
  const webAdapter = window.__webAdapter || null;

  const adapter = hasDesktopBridge ? desktopAdapter : webAdapter;

  if (!adapter) {
    throw new Error('Nenhum adapter disponivel. Carregue shared/adapters/desktop-adapter.js e shared/adapters/web-adapter.js antes.');
  }

  window.appApi = adapter;
})();
