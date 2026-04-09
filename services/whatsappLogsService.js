const { randomUUID } = require('crypto');

const generateLogId = () => (
  typeof randomUUID === 'function'
    ? randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);

const createWhatsappLogsService = ({
  whatsappLogsFile,
  pathExists,
  readJsonFile,
  writeJsonFile,
}) => {
  const ensureLogsFile = async () => {
    if (!(await pathExists(whatsappLogsFile))) {
      await writeJsonFile(whatsappLogsFile, { logs: [] });
    }
  };

  const readLogs = async () => {
    await ensureLogsFile();
    const payload = await readJsonFile(whatsappLogsFile).catch(() => ({ logs: [] }));
    return Array.isArray(payload?.logs) ? payload.logs : [];
  };

  const writeLogs = async (logs) => {
    await ensureLogsFile();
    await writeJsonFile(whatsappLogsFile, { logs: Array.isArray(logs) ? logs : [] });
  };

  const normalizeEntry = (entry = {}, status = 'FAILED') => ({
    logId: String(entry?.logId || generateLogId()),
    clinicId: String(entry?.clinicId || '').trim(),
    provider: String(entry?.provider || 'whatsapp_engine').trim().toLowerCase() || 'whatsapp_engine',
    instanceId: String(entry?.instanceId || '').trim(),
    clinicSenderPhone: String(entry?.clinicSenderPhone || '').trim(),
    patientId: String(entry?.patientId || '').trim(),
    appointmentId: String(entry?.appointmentId || '').trim(),
    campaignId: String(entry?.campaignId || '').trim(),
    phone: String(entry?.phone || '').trim(),
    message: String(entry?.message || '').trim(),
    type: ['APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER', 'CAMPAIGN', 'MANUAL'].includes(String(entry?.type || '').trim())
      ? String(entry.type).trim()
      : 'MANUAL',
    status: status === 'SENT' ? 'SENT' : 'FAILED',
    errorMessage: String(entry?.errorMessage || '').trim(),
    createdAt: String(entry?.createdAt || new Date().toISOString()),
  });

  const logWhatsappSent = async (entry = {}) => {
    const logs = await readLogs();
    logs.push(normalizeEntry(entry, 'SENT'));
    await writeLogs(logs);
    return logs[logs.length - 1];
  };

  const logWhatsappFailed = async (entry = {}) => {
    const logs = await readLogs();
    logs.push(normalizeEntry(entry, 'FAILED'));
    await writeLogs(logs);
    return logs[logs.length - 1];
  };

  const listWhatsappLogs = async ({ clinicId, filters = {} } = {}) => {
    const targetClinicId = String(clinicId || '').trim();
    const typeFilter = String(filters?.type || '').trim().toUpperCase();
    const statusFilter = String(filters?.status || '').trim().toUpperCase();
    const patientIdFilter = String(filters?.patientId || '').trim();
    const appointmentIdFilter = String(filters?.appointmentId || '').trim();
    const campaignIdFilter = String(filters?.campaignId || '').trim();
    const phoneFilter = String(filters?.phone || '').replace(/\D/g, '');
    const from = String(filters?.dateFrom || '').trim();
    const to = String(filters?.dateTo || '').trim();
    const limit = Math.max(1, Math.min(1000, Number(filters?.limit || 200)));

    const logs = await readLogs();
    const items = logs
      .filter((item) => !targetClinicId || String(item?.clinicId || '').trim() === targetClinicId)
      .filter((item) => !typeFilter || String(item?.type || '').trim().toUpperCase() === typeFilter)
      .filter((item) => !statusFilter || String(item?.status || '').trim().toUpperCase() === statusFilter)
      .filter((item) => !patientIdFilter || String(item?.patientId || '').trim() === patientIdFilter)
      .filter((item) => !appointmentIdFilter || String(item?.appointmentId || '').trim() === appointmentIdFilter)
      .filter((item) => !campaignIdFilter || String(item?.campaignId || '').trim() === campaignIdFilter)
      .filter((item) => {
        if (!phoneFilter) return true;
        return String(item?.phone || '').replace(/\D/g, '').includes(phoneFilter);
      })
      .filter((item) => {
        const day = String(item?.createdAt || '').slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      })
      .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')))
      .slice(0, limit);

    return {
      clinicId: targetClinicId,
      items,
      total: items.length,
    };
  };

  return {
    logWhatsappSent,
    logWhatsappFailed,
    listWhatsappLogs,
  };
};

module.exports = { createWhatsappLogsService };
