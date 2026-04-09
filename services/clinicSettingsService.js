const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const normalizeClinicId = (value) => String(value || DEFAULT_CLINIC_ID).trim().replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_CLINIC_ID;

const createClinicSettingsService = ({
  clinicPath,
  clinicFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
}) => {
  const scopedRoot = path.join(clinicPath, 'by-clinic');
  const getScopedDir = (clinicId) => path.join(scopedRoot, normalizeClinicId(clinicId));
  const getScopedClinicFile = (clinicId) => path.join(getScopedDir(clinicId), 'clinica.json');

  const ensureClinicRecord = async (clinicIdArg) => {
    const clinicId = normalizeClinicId(clinicIdArg);
    const scopedDir = getScopedDir(clinicId);
    const scopedFile = getScopedClinicFile(clinicId);
    await ensureDir(scopedRoot);
    await ensureDir(scopedDir);

    if (await pathExists(scopedFile)) {
      const existing = await readJsonFile(scopedFile).catch(() => ({}));
      return existing && typeof existing === 'object' ? existing : {};
    }

    if (clinicId === DEFAULT_CLINIC_ID && (await pathExists(clinicFile))) {
      const legacy = await readJsonFile(clinicFile).catch(() => ({}));
      const seeded = legacy && typeof legacy === 'object' ? legacy : {};
      await writeJsonFile(scopedFile, seeded);
      return seeded;
    }

    await writeJsonFile(scopedFile, {});
    return {};
  };

  const getClinicSettings = async (clinicIdArg) => {
    const clinicId = normalizeClinicId(clinicIdArg);
    const clinic = await ensureClinicRecord(clinicId);
    return {
      clinicId,
      ...(clinic || {}),
    };
  };

  return {
    normalizeClinicId,
    getClinicSettings,
  };
};

module.exports = {
  DEFAULT_CLINIC_ID,
  createClinicSettingsService,
};
