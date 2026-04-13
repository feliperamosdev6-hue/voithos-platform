const loadModuleWithMocks = (targetModulePath, mockMap = {}) => {
  const targetResolved = require.resolve(targetModulePath);
  const savedTarget = require.cache[targetResolved];
  const savedMocks = new Map();

  Object.entries(mockMap).forEach(([modulePath, exports]) => {
    const resolved = require.resolve(modulePath);
    savedMocks.set(resolved, require.cache[resolved]);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports,
    };
  });

  delete require.cache[targetResolved];
  const loadedModule = require(targetResolved);

  const restore = () => {
    delete require.cache[targetResolved];
    if (savedTarget) {
      require.cache[targetResolved] = savedTarget;
    }
    savedMocks.forEach((cached, resolved) => {
      delete require.cache[resolved];
      if (cached) {
        require.cache[resolved] = cached;
      }
    });
  };

  return { module: loadedModule, restore };
};

module.exports = { loadModuleWithMocks };
