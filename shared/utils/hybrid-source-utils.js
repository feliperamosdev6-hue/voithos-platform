const SOURCE = {
  CENTRAL: 'central',
  LEGACY: 'legacy',
  MERGED: 'merged',
};

const CENTRAL_SOURCE_POLICY = {
  preferredWhenAvailable: true,
  fallback: SOURCE.LEGACY,
  compatibility: 'legacy-shadow-write',
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

const withSource = (record, source) => {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    source,
    __source: source,
  };
};

const buildPatientKeys = (patient = {}) => {
  const keys = [];
  const id = String(patient?.id || patient?.prontuario || '').trim();
  const cpf = normalizeDigits(patient?.cpf);
  const phone = normalizeDigits(patient?.telefone);
  const name = normalizeText(patient?.nome || patient?.fullName);

  if (id) keys.push(`id:${id}`);
  if (cpf) keys.push(`cpf:${cpf}`);
  if (name && phone) keys.push(`name-phone:${name}:${phone}`);

  return keys;
};

const buildAppointmentKeys = (appointment = {}) => {
  const keys = [];
  const id = String(appointment?.id || '').trim();
  const patientId = String(appointment?.patientId || appointment?.pacienteId || appointment?.prontuario || '').trim();
  const date = String(appointment?.data || '').trim();
  const time = String(appointment?.horaInicio || '').trim();
  const professionalId = String(appointment?.dentistaId || appointment?.profissionalId || '').trim();

  if (id) keys.push(`id:${id}`);
  if (patientId && date && time) keys.push(`slot:${patientId}:${date}:${time}:${professionalId}`);

  return keys;
};

const mergeByKeys = ({ central = [], legacy = [], getKeys }) => {
  const keyToIndex = new Map();
  const merged = [];

  const attach = (record, source) => {
    const enriched = withSource(record, source);
    const keys = getKeys(enriched);

    if (!keys.length) {
      merged.push(enriched);
      return;
    }

    const existingIndex = keys.find((key) => keyToIndex.has(key));
    if (existingIndex === undefined) {
      const index = merged.push(enriched) - 1;
      keys.forEach((key) => keyToIndex.set(key, index));
      return;
    }

    const index = keyToIndex.get(existingIndex);
    const current = merged[index];
    const preferred = current?.source === SOURCE.CENTRAL ? current : enriched;
    const next = {
      ...current,
      ...enriched,
      ...preferred,
      source: SOURCE.MERGED,
      __source: SOURCE.MERGED,
    };
    merged[index] = next;

    Array.from(new Set([...getKeys(current), ...keys])).forEach((key) => keyToIndex.set(key, index));
  };

  central.forEach((record) => attach(record, SOURCE.CENTRAL));
  legacy.forEach((record) => attach(record, SOURCE.LEGACY));

  return merged;
};

const mergePatients = ({ central = [], legacy = [] }) => (
  mergeByKeys({ central, legacy, getKeys: buildPatientKeys })
);

const mergeAppointments = ({ central = [], legacy = [] }) => (
  mergeByKeys({ central, legacy, getKeys: buildAppointmentKeys })
);

module.exports = {
  SOURCE,
  CENTRAL_SOURCE_POLICY,
  withSource,
  mergePatients,
  mergeAppointments,
};
