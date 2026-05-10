const path = require('path');
const {
  SOURCE,
  withSource,
} = require('../shared/utils/hybrid-source-utils');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const registerPatientsHandlers = ({
  ipcMain,
  BrowserWindow,
  requireRole,
  listPatients,
  searchPatients,
  deletePatient,
  savePatient,
  updateDentist,
  readPatient,
  findPatient,
  centralBackendAdapter,
  patientsPath,
  pathExists,
  ensureDir,
  fsPromises,
  readJsonFile,
  currentUserRef,
}) => {
  const allowedSelfieExt = new Set(['.png', '.jpg', '.jpeg', '.svg', '.pdf']);
  let centralLogged = false;
  const getCurrentClinicId = () => String(
    (typeof currentUserRef === 'function' ? currentUserRef()?.clinicId : '')
    || DEFAULT_CLINIC_ID
  ).trim() || DEFAULT_CLINIC_ID;

  const isCentralEnabled = () => centralBackendAdapter?.isEnabled?.() === true;
  const shouldFallbackToLocal = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    const status = Number(error?.status || 0);
    return code === 'CENTRAL_BACKEND_UNAVAILABLE'
      || code === 'CENTRAL_BACKEND_TIMEOUT'
      || error?.name === 'AbortError'
      || status >= 500;
  };

  const logCentralActive = () => {
    if (centralLogged) return;
    centralLogged = true;
    console.info('[PATIENTS] central backend active');
  };

  const logLoadedFromCentral = (mode, extra = {}) => {
    console.info('[PATIENTS] patients_loaded_from=central', JSON.stringify({
      mode,
      clinicId: getCurrentClinicId(),
      source: SOURCE.CENTRAL,
      ...extra,
    }));
  };

  const logFallback = (mode, reason) => {
    console.warn('[PATIENTS] patients_fallback_to_local=true', JSON.stringify({
      mode,
      module: 'patients',
      operation: mode,
      clinicId: getCurrentClinicId(),
      source: SOURCE.LEGACY,
      fallback_triggered: true,
      fallback_reason: reason || '',
      reason: reason || '',
    }));
  };

  const logCentralUnavailable = (error) => {
    console.warn('[PATIENTS] central backend unavailable', error?.message || error);
  };

  const markLegacyPatients = (items = []) => items.map((patient) => withSource(patient, SOURCE.LEGACY));
  const markCentralPatients = (items = []) => items.map((patient) => withSource(patient, SOURCE.CENTRAL));

  const resolveSelfieExt = (fileName = '', mimeType = '') => {
    const fromName = path.extname(String(fileName || '')).toLowerCase();
    if (allowedSelfieExt.has(fromName)) return fromName;

    const mime = String(mimeType || '').toLowerCase().trim();
    if (mime === 'image/png') return '.png';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
    if (mime === 'image/svg+xml') return '.svg';
    if (mime === 'application/pdf') return '.pdf';
    return '';
  };

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isCentralPatientId = (value) => UUID_PATTERN.test(String(value || '').trim());

  ipcMain.handle('list-patients', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    if (!isCentralEnabled()) return listPatients();

    try {
      logCentralActive();
      const currentClinicId = getCurrentClinicId();
      const centralPatients = await centralBackendAdapter.getPatients({ clinicId: currentClinicId });
      logLoadedFromCentral('list', {
        count: centralPatients.length,
      });
      return markCentralPatients(centralPatients);
    } catch (error) {
      logCentralUnavailable(error);
      if (!shouldFallbackToLocal(error)) throw error;
      const legacyPatients = await listPatients();
      logFallback('list', error?.message || String(error));
      return markLegacyPatients(legacyPatients);
    }
  });

  ipcMain.handle('search-patients', async (_event, query) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    if (!isCentralEnabled()) return searchPatients(query);

    try {
      logCentralActive();
      const centralResults = await centralBackendAdapter.searchPatients(query, { clinicId: getCurrentClinicId() });
      logLoadedFromCentral('search', {
        count: centralResults.length,
      });
      return markCentralPatients(centralResults);
    } catch (error) {
      logCentralUnavailable(error);
      if (!shouldFallbackToLocal(error)) throw error;
      const legacyResults = await searchPatients(query);
      logFallback('search', error?.message || String(error));
      return markLegacyPatients(legacyResults);
    }
  });

  ipcMain.handle('delete-patient', async (_event, prontuario) => {
    requireRole(['admin']);
    if (!isCentralEnabled()) return deletePatient(prontuario);

    try {
      logCentralActive();
      const result = await centralBackendAdapter.deletePatient(prontuario, { clinicId: getCurrentClinicId() });
      try {
        await deletePatient(prontuario);
        console.info('[PATIENTS]', JSON.stringify({
          module: 'patients',
          operation: 'delete',
          clinicId: getCurrentClinicId(),
          patientId: String(prontuario || '').trim(),
          shadow_write_executed: true,
        }));
      } catch (shadowError) {
        console.warn('[PATIENTS] shadow delete local failed', shadowError?.message || shadowError);
      }
      return result;
    } catch (error) {
      logCentralUnavailable(error);
      throw error;
    }
  });

  ipcMain.handle('open-patient-file-window', async (_event, prontuario) => {
    requireRole(['admin', 'recepcionista']);
    if (!prontuario) throw new Error('Prontuario e obrigatorio.');
    const filePath = path.join(patientsPath, `${prontuario}.json`);
    if (!(await pathExists(filePath))) throw new Error('Paciente nao encontrado.');
    const patient = await readJsonFile(filePath);

    const win = new BrowserWindow({
      width: 1000,
      height: 800,
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js') },
    });

    await win.loadFile('prontuario.html');
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('load-patient-data', patient);
    });
  });

  ipcMain.handle('save-patient', async (_event, patientData) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const explicitId = String(patientData?.id || '').trim();
    const prontuarioValue = String(patientData?.prontuario || '').trim();
    const patientId = explicitId || (isCentralPatientId(prontuarioValue) ? prontuarioValue : '');
    const isUpdate = patientId !== '';
    console.info('[PATIENTS] patient_create_started', JSON.stringify({
      clinicId: getCurrentClinicId(),
      isUpdate,
      patientId,
      prontuario: prontuarioValue,
      selected_dentist_id: String(patientData?.dentistaId || '').trim(),
    }));

    if (!isCentralEnabled()) {
      return savePatient(patientData);
    }

    try {
      logCentralActive();
      const centralPatient = isUpdate
        ? await centralBackendAdapter.updatePatient(patientId, patientData, { clinicId: getCurrentClinicId() })
        : await centralBackendAdapter.createPatient(patientData, { clinicId: getCurrentClinicId() });

      try {
        await savePatient({
          ...patientData,
          id: centralPatient.id,
          prontuario: centralPatient.prontuario || centralPatient.id,
          nome: centralPatient.nome || patientData?.nome || patientData?.fullName || '',
          fullName: centralPatient.fullName || centralPatient.nome || patientData?.fullName || patientData?.nome || '',
          clinicId: getCurrentClinicId(),
        });
        console.info('[PATIENTS]', JSON.stringify({
          module: 'patients',
          operation: isUpdate ? 'update' : 'create',
          clinicId: getCurrentClinicId(),
          patientId: centralPatient.id,
          shadow_write_executed: true,
        }));
      } catch (shadowError) {
        console.warn('[PATIENTS] shadow write local failed', shadowError?.message || shadowError);
      }

      return {
        success: true,
        patient: withSource(centralPatient, SOURCE.CENTRAL),
      };
    } catch (error) {
      logCentralUnavailable(error);
      console.warn('[PATIENTS] patient_create_failed', JSON.stringify({
        clinicId: getCurrentClinicId(),
        isUpdate,
        patientId,
        prontuario: prontuarioValue,
        failure_layer: 'ipc',
        message: error?.message || String(error),
      }));
      throw error;
    }
  });

  ipcMain.handle('patient-update-dentist', async (_event, { prontuario, novoDentistaId }) => {
    requireRole(['admin', 'recepcionista']);
    if (isCentralEnabled()) {
      try {
        logCentralActive();
        const current = await centralBackendAdapter.getPatientById(prontuario, { clinicId: getCurrentClinicId() });
        if (!current?.id) throw new Error('Paciente nao encontrado.');
        const centralPatient = await centralBackendAdapter.updatePatient(current.id, {
          ...current,
          dentistaId: String(novoDentistaId || '').trim(),
        }, { clinicId: getCurrentClinicId() });

        try {
          await savePatient({
            ...centralPatient,
            id: centralPatient.id,
            prontuario: centralPatient.prontuario || centralPatient.id,
            clinicId: getCurrentClinicId(),
          });
        } catch (shadowError) {
          console.warn('[PATIENTS] shadow dentist update local failed', shadowError?.message || shadowError);
        }

        return {
          success: true,
          patient: withSource(centralPatient, SOURCE.CENTRAL),
        };
      } catch (error) {
        logCentralUnavailable(error);
        if (!shouldFallbackToLocal(error)) throw error;
      }
    }
    return updateDentist({ prontuario, novoDentistaId });
  });

  ipcMain.handle('read-patient', async (_event, prontuario) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    if (isCentralEnabled()) {
      try {
        logCentralActive();
        const patient = await centralBackendAdapter.getPatientById(prontuario, { clinicId: getCurrentClinicId() });
        if (patient) {
          logLoadedFromCentral('read', {
            patientId: patient?.id || prontuario,
          });
          return withSource(patient, SOURCE.CENTRAL);
        }
      } catch (error) {
        logCentralUnavailable(error);
        if (shouldFallbackToLocal(error)) {
          logFallback('read', error?.message || String(error));
        } else {
          throw error;
        }
      }
    }

    try {
      return await readPatient(prontuario);
    } catch (legacyError) {
      throw legacyError;
    }
  });

  ipcMain.handle('find-patient', async (_event, query) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    if (isCentralEnabled()) {
      try {
        logCentralActive();
        const identifier = typeof query === 'object'
          ? (query?.prontuario || query?.id || '')
          : '';
        if (identifier) {
          const patient = await centralBackendAdapter.getPatientById(identifier, { clinicId: getCurrentClinicId() });
          if (patient) {
            logLoadedFromCentral('find', {
              patientId: patient?.id || identifier,
            });
            return withSource(patient, SOURCE.CENTRAL);
          }
        }

        const searchBase = typeof query === 'string'
          ? query
          : query?.prontuario || query?.fullName || query?.nome || '';
        const results = await centralBackendAdapter.searchPatients(searchBase, { clinicId: getCurrentClinicId() });
        if (results[0]) {
          logLoadedFromCentral('find', {
            patientId: results[0]?.id || '',
          });
          return withSource(results[0], SOURCE.CENTRAL);
        }
      } catch (error) {
        logCentralUnavailable(error);
        if (shouldFallbackToLocal(error)) {
          logFallback('find', error?.message || String(error));
        } else {
          throw error;
        }
      }
    }

    return findPatient(query);
  });

  ipcMain.handle('patient-upload-selfie', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista', 'dentista']);

    const prontuario = String(payload.prontuario || '').trim();
    const filePath = String(payload.filePath || '').trim();
    const fileName = String(payload.fileName || '').trim();
    const mimeType = String(payload.mimeType || '').trim();

    if (!prontuario) throw new Error('Prontuario obrigatorio para selfie.');
    if (!filePath) throw new Error('Arquivo da selfie obrigatorio.');
    if (!(await pathExists(filePath))) throw new Error('Arquivo de selfie nao encontrado.');

    await readPatient(prontuario);

    const ext = resolveSelfieExt(fileName, mimeType);
    if (!ext) {
      throw new Error('Formato de selfie nao suportado. Use PNG, JPG, JPEG, SVG ou PDF.');
    }

    const patientDir = path.join(patientsPath, prontuario);
    await ensureDir(patientDir);

    const targetName = `selfie${ext}`;
    const targetPath = path.join(patientDir, targetName);
    await fsPromises.copyFile(filePath, targetPath);
    const stat = await fsPromises.stat(targetPath);

    const patientFile = path.join(patientsPath, `${prontuario}.json`);
    if (!(await pathExists(patientFile))) throw new Error('Paciente nao encontrado.');
    const patient = await readJsonFile(patientFile);

    const selfieRelativePath = path.join(prontuario, targetName);
    const updated = {
      ...patient,
      selfiePath: selfieRelativePath,
      selfieFileName: fileName || targetName,
      selfieMime: mimeType || '',
      selfieUpdatedAt: new Date().toISOString(),
      selfieSize: stat.size || 0,
    };

    await savePatient(updated);

    return {
      success: true,
      selfiePath: selfieRelativePath,
      selfieUrl: `file://${targetPath.replace(/\\/g, '/')}`,
      selfieMime: updated.selfieMime,
      selfieUpdatedAt: updated.selfieUpdatedAt,
      selfieSize: updated.selfieSize,
    };
  });
};

module.exports = { registerPatientsHandlers };
