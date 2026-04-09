const path = require('path');
const { decryptSecret } = require('./utils/secretsCrypto');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const toDigits = (value) => String(value || '').replace(/\D/g, '');
const normalizeClinicId = (value) => String(value || DEFAULT_CLINIC_ID).trim().replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_CLINIC_ID;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

const createAppointmentMessagingService = ({
  agendaPath,
  patientsPath,
  clinicPath,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  fsPromises,
  sendWhatsAppMessage,
  centralBackendAdapter,
}) => {
  const logsDir = path.join(clinicPath, 'logs');
  let schedulerTimer = null;
  let running = false;

  const getClinicFile = (clinicId) => path.join(clinicPath, 'by-clinic', normalizeClinicId(clinicId), 'clinica.json');
  const getLogsFile = (clinicId) => path.join(logsDir, `appointment-messages-${normalizeClinicId(clinicId)}.json`);

  const readClinicConfig = async (clinicId) => {
    const file = getClinicFile(clinicId);
    if (!(await pathExists(file))) return null;
    const data = await readJsonFile(file).catch(() => null);
    if (!data) return null;
    const whatsapp = data?.messaging?.whatsapp || {};
    return {
      ...data,
      messaging: {
        ...(data.messaging || {}),
        whatsapp: {
          ...whatsapp,
          token: decryptSecret(String(whatsapp.token || whatsapp.accessToken || '')),
          clientToken: decryptSecret(String(whatsapp.clientToken || whatsapp.client_token || '')),
        },
      },
    };
  };

  const readLogs = async (clinicId) => {
    await ensureDir(logsDir);
    const file = getLogsFile(clinicId);
    if (!(await pathExists(file))) return [];
    const data = await readJsonFile(file).catch(() => ({ logs: [] }));
    return Array.isArray(data?.logs) ? data.logs : [];
  };

  const appendLog = async (clinicId, entry) => {
    const file = getLogsFile(clinicId);
    const logs = await readLogs(clinicId);
    logs.push({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      clinicId: normalizeClinicId(clinicId),
      ...entry,
    });
    while (logs.length > 8000) logs.shift();
    await writeJsonFile(file, { logs });
  };

  const hasSuccessfulLog = async (clinicId, dedupeKey) => {
    if (!dedupeKey) return false;
    const logs = await readLogs(clinicId);
    return logs.some((item) => item?.dedupeKey === dedupeKey && item?.status === 'success');
  };

  const findPatientForAppointment = async (appt) => {
    const keys = [
      appt?.prontuario,
      appt?.pacienteId,
      appt?.patientId,
    ].filter(Boolean).map((v) => String(v));

    for (const key of keys) {
      const direct = path.join(patientsPath, `${key}.json`);
      if (await pathExists(direct)) {
        const patient = await readJsonFile(direct).catch(() => null);
        if (patient) return patient;
      }
    }

    const name = String(appt?.pacienteNome || appt?.paciente || '').trim().toLowerCase();
    if (!name) return null;
    const files = await fsPromises.readdir(patientsPath).catch(() => []);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const patient = await readJsonFile(path.join(patientsPath, file)).catch(() => null);
      const pName = String(patient?.nome || patient?.fullName || '').trim().toLowerCase();
      if (pName && pName === name) return patient;
    }
    return null;
  };

  const buildMessage = (appt, mode) => {
    const paciente = appt?.pacienteNome || appt?.paciente || 'Paciente';
    const [y, m, d] = String(appt?.data || '').split('-');
    const dateBr = y && m && d ? `${d}/${m}/${y}` : String(appt?.data || '-');
    const hora = appt?.horaInicio || '--:--';
    const tipo = appt?.tipo || 'consulta';
    if (mode === 'lembrete_d1') {
      return `Ola, ${paciente}. Lembrete: sua consulta (${tipo}) e amanha (${dateBr}) as ${hora}.`;
    }
    return `Ola, ${paciente}. Confirmacao da sua consulta (${tipo}) em ${dateBr} as ${hora}.`;
  };

  const sendForAppointment = async ({ appt, mode = 'confirmacao', trigger = 'manual' }) => {
    if (!appt?.id || !appt?.data) return { skipped: true, reason: 'invalid_appointment' };
    const clinicId = normalizeClinicId(appt?.clinicId || DEFAULT_CLINIC_ID);
    const patient = await findPatientForAppointment(appt);
    if (!patient) return { skipped: true, reason: 'patient_not_found' };
    if (patient?.allowsMessages === false) return { skipped: true, reason: 'opt_out' };
    const phone = patient?.telefone || patient?.phone || patient?.celular || patient?.whatsapp || '';
    if (toDigits(phone).length < 10) return { skipped: true, reason: 'invalid_phone' };

    const dedupeKey = `${mode}:${String(appt.id)}:${String(appt.data)}`;
    if (await hasSuccessfulLog(clinicId, dedupeKey)) return { skipped: true, reason: 'already_sent' };

    const clinicConfig = await readClinicConfig(clinicId);
    if (!clinicConfig?.messaging?.whatsapp?.enabled) return { skipped: true, reason: 'whatsapp_disabled' };

    const canUseCentralReminder =
      mode === 'lembrete_d1'
      && centralBackendAdapter?.isEnabled?.() === true
      && typeof centralBackendAdapter?.sendAppointmentReminder === 'function'
      && String(appt?.id || '').trim();

    try {
      const response = canUseCentralReminder
        ? await centralBackendAdapter.sendAppointmentReminder({
          id: String(appt.id).trim(),
          clinicId,
        })
        : await sendWhatsAppMessage({
          clinicConfig,
          to: phone,
          text: buildMessage(appt, mode),
        });
      await appendLog(clinicId, {
        status: 'success',
        type: mode,
        trigger,
        dedupeKey,
        to: phone,
        provider: canUseCentralReminder ? 'central_backend' : String(response?.provider || 'whatsapp_engine').trim().toLowerCase(),
        instanceId: String(response?.instanceId || response?.providerMessageId || '').trim(),
        clinicSenderPhone: String(response?.clinicSenderPhone || '').trim(),
        appointmentId: appt.id,
        appointmentDate: appt.data,
        transport: canUseCentralReminder ? 'backend_central_d1' : 'legacy_local_d1',
      });
      return { success: true, response };
    } catch (err) {
      await appendLog(clinicId, {
        status: 'error',
        type: mode,
        trigger,
        dedupeKey,
        to: phone,
        provider: 'whatsapp_engine',
        instanceId: '',
        clinicSenderPhone: '',
        appointmentId: appt.id,
        appointmentDate: appt.data,
        error: err?.message || String(err),
        transport: canUseCentralReminder ? 'backend_central_d1' : 'legacy_local_d1',
      });
      throw err;
    }
  };

  const sendConfirmationOnCreate = async (appt, trigger = 'auto_on_create') => {
    return sendForAppointment({ appt, mode: 'confirmacao', trigger });
  };

  const listAppointmentsByDate = async (dateIso) => {
    await ensureDir(agendaPath);
    const files = await fsPromises.readdir(agendaPath).catch(() => []);
    const list = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const payload = await readJsonFile(path.join(agendaPath, file)).catch(() => null);
      const ags = Array.isArray(payload?.agendamentos) ? payload.agendamentos : [];
      ags.forEach((appt) => {
        if (String(appt?.data || '') !== String(dateIso)) return;
        if (String(appt?.status || '').toLowerCase() === 'cancelado') return;
        if (String(appt?.status || '').toLowerCase() === 'realizado') return;
        list.push(appt);
      });
    }
    return list;
  };

  const getTomorrowIso = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const runDayBeforeReminderJob = async ({ dateIso } = {}) => {
    const target = dateIso || getTomorrowIso();
    const appts = await listAppointmentsByDate(target);
    let sent = 0;
    let failed = 0;
    for (const appt of appts) {
      try {
        const result = await sendForAppointment({ appt, mode: 'lembrete_d1', trigger: 'scheduler_d1' });
        if (result?.success) sent += 1;
      } catch (_) {
        failed += 1;
      }
      await sleep(700);
    }
    return { targetDate: target, total: appts.length, sent, failed };
  };

  const startReminderScheduler = ({ intervalMinutes = 60 } = {}) => {
    const intervalMs = Math.max(1, Number(intervalMinutes || 60)) * 60 * 1000;
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await runDayBeforeReminderJob({});
      } catch (_) {
      } finally {
        running = false;
      }
    }, intervalMs);
    return { started: true, intervalMs };
  };

  const stopReminderScheduler = () => {
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = null;
    return { stopped: true };
  };

  return {
    sendConfirmationOnCreate,
    runDayBeforeReminderJob,
    startReminderScheduler,
    stopReminderScheduler,
  };
};

module.exports = { createAppointmentMessagingService };
