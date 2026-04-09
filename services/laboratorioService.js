const createLaboratorioService = ({
  financePath,
  labFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
}) => {
  const ensureLaboratorioFile = async () => {
    await ensureDir(financePath);
    if (!(await pathExists(labFile))) {
      await writeJsonFile(labFile, { registros: [] });
    }
  };

  const readLaboratorio = async () => {
    await ensureLaboratorioFile();
    const data = await readJsonFile(labFile);
    if (Array.isArray(data)) return data;
    return Array.isArray(data.registros) ? data.registros : [];
  };

  const writeLaboratorio = async (list) => {
    await ensureLaboratorioFile();
    await writeJsonFile(labFile, { registros: list });
  };

  return {
    ensureLaboratorioFile,
    readLaboratorio,
    writeLaboratorio,
  };
};

module.exports = { createLaboratorioService };
