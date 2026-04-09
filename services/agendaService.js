const path = require('path');
const { randomUUID } = require('crypto');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const createAgendaService = ({
  agendaPath,
  patientsPath,
  readJsonFile,
  writeJsonFile,
  pathExists,
  ensureDir,
  fsPromises,
  getCurrentUser,
  readUsers,
  getDataHoraAtual,
}) => {
  const agendaStatuses = ['em_aberto', 'confirmado', 'realizado', 'nao_compareceu', 'cancelado'];

  const getCurrentClinicId = () => {
    const user = getCurrentUser?.() || null;
    return String(user?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  };

  const generateId = () => (
    typeof randomUUID === 'function'
      ? randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );

  const generateAppointmentId = (appt) => appt?.id || generateId();

  const normalizeTimeInput = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if (!match) return '';
    const h = Number(match[1]);
    const m = Number(match[2] ?? 0);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return '';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const timeToMinutes = (value) => {
    const normalized = normalizeTimeInput(value);
    if (!normalized) return null;
    const [h, m] = normalized.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };

  const isOverlapping = (startA, endA, startB, endB) => {
    const aStart = timeToMinutes(startA);
    const aEnd = timeToMinutes(endA);
    const bStart = timeToMinutes(startB);
    const bEnd = timeToMinutes(endB);
    if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
    return aStart < bEnd && bStart < aEnd;
  };

  const hasConflict = (list, appt, ignoreId) => {
    if (!Array.isArray(list) || !appt?.data) return false;
    const targetDentId = String(appt.dentistaId || '');
    const targetClinicId = String(appt.clinicId || getCurrentClinicId());
    return list.some((existing) => {
      if (!existing?.data || existing.data !== appt.data) return false;
      if (String(existing?.clinicId || DEFAULT_CLINIC_ID) !== targetClinicId) return false;
      if (ignoreId && String(existing.id || '') === String(ignoreId)) return false;
      if (String(existing.status || '') === 'cancelado') return false;
      if (targetDentId && existing.dentistaId && String(existing.dentistaId) !== targetDentId) return false;
      return isOverlapping(appt.horaInicio, appt.horaFim, existing.horaInicio || '', existing.horaFim || '');
    });
  };

  const getAgendaYearFilePath = (year) => path.join(agendaPath, `${year}.json`);

  const ensureAgendaYear = async (year) => {
    await ensureDir(agendaPath);
    const file = getAgendaYearFilePath(year);
    if (!(await pathExists(file))) {
      await writeJsonFile(file, { agendamentos: [] });
    }
    return file;
  };

  const readAgendaYear = async (year) => {
    const file = await ensureAgendaYear(year);
    const data = await readJsonFile(file);
    const list = Array.isArray(data.agendamentos) ? data.agendamentos : [];
    let changed = false;
    const normalized = list.map((appt) => {
      if (appt?.clinicId) return appt;
      changed = true;
      return { ...appt, clinicId: DEFAULT_CLINIC_ID };
    });
    if (changed) {
      await writeJsonFile(file, { agendamentos: normalized });
    }
    return normalized;
  };

  const writeAgendaYear = async (year, list) => {
    const file = await ensureAgendaYear(year);
    await writeJsonFile(file, { agendamentos: list });
  };

  const getPatientFilePath = (key) => {
    if (!key) return '';
    if (patientsPath) return path.join(patientsPath, `${key}.json`);
    return path.join(agendaPath, '..', 'PACIENTES', `${key}.json`);
  };

  const resolvePatientKey = async (key) => {
    if (!key) return '';
    const directPath = getPatientFilePath(key);
    if (directPath && await pathExists(directPath)) return key;
    if (!patientsPath) return '';
    const files = await fsPromises.readdir(patientsPath);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const patient = await readJsonFile(path.join(patientsPath, file));
        const matchKey = patient?.prontuario || patient?.id || patient?._id || '';
        if (String(matchKey) === String(key)) {
          return patient.prontuario || matchKey;
        }
      } catch (_) {
      }
    }
    return '';
  };

  const readPatientFile = async (key) => {
    const resolvedKey = await resolvePatientKey(key);
    if (!resolvedKey) return null;
    const filePath = getPatientFilePath(resolvedKey);
    if (!filePath || !(await pathExists(filePath))) return null;
    const patient = await readJsonFile(filePath);
    if (!patient.clinicId) {
      patient.clinicId = DEFAULT_CLINIC_ID;
      await writeJsonFile(filePath, patient);
    }
    return patient;
  };

  const writePatientFile = async (key, patient) => {
    const resolvedKey = await resolvePatientKey(key || patient?.prontuario || patient?.id || patient?._id || '');
    if (!resolvedKey) return;
    const filePath = getPatientFilePath(resolvedKey);
    if (!filePath) return;
    await writeJsonFile(filePath, patient);
  };

  const buildConsultaPayload = (appt) => {
    const tempo = getDataHoraAtual();
    const rawStatus = String(appt.status || 'em_aberto').trim().toLowerCase();
    const derivedAttendanceStatus = String(appt.attendanceStatus || '').trim().toLowerCase()
      || (rawStatus === 'realizado' ? 'compareceu' : '')
      || (rawStatus === 'nao_compareceu' ? 'nao_compareceu' : '');
    const normalizedAgendaStatus = ['realizado', 'nao_compareceu'].includes(rawStatus)
      ? (appt.confirmado === true ? 'confirmado' : 'em_aberto')
      : rawStatus;
    return {
      id: appt.id,
      appointmentId: appt.id,
      clinicId: appt.clinicId || DEFAULT_CLINIC_ID,
      patientId: appt.patientId || appt.pacienteId || appt.prontuario || '',
      prontuario: appt.prontuario || appt.pacienteId || appt.patientId || '',
      data: appt.data,
      horaInicio: appt.horaInicio,
      horaFim: appt.horaFim,
      tipo: appt.tipo,
      status: normalizedAgendaStatus || 'em_aberto',
      attendanceStatus: derivedAttendanceStatus,
      dentistaId: appt.dentistaId,
      dentistaNome: appt.dentistaNome,
      observacoes: appt.observacoes || '',
      marcadorId: appt.marcadorId || '',
      marcadorNome: appt.marcadorNome || '',
      marcadorCor: appt.marcadorCor || '',
      dataAtualizacao: tempo.data,
      horaAtualizacao: tempo.hora,
    };
  };

  const upsertPatientConsulta = async (key, appt) => {
    if (!key) return;
    const patient = await readPatientFile(key);
    if (!patient) return;
    if (String(patient.clinicId || DEFAULT_CLINIC_ID) !== String(appt.clinicId || DEFAULT_CLINIC_ID)) return;
    const consultas = Array.isArray(patient.consultas) ? patient.consultas : [];
    const idx = consultas.findIndex((c) => String(c.id || '') === String(appt.id || ''));
    const payload = buildConsultaPayload(appt);
    if (idx >= 0) {
      consultas[idx] = { ...consultas[idx], ...payload };
    } else {
      consultas.push(payload);
    }
    patient.consultas = consultas;
    await writePatientFile(key, patient);
  };

  const removePatientConsulta = async (key, apptId) => {
    if (!key || !apptId) return;
    const patient = await readPatientFile(key);
    if (!patient) return;
    const consultas = Array.isArray(patient.consultas) ? patient.consultas : [];
    const filtered = consultas.filter((c) => String(c.id || '') !== String(apptId));
    patient.consultas = filtered;
    await writePatientFile(key, patient);
  };

  const validateAppt = (a) => {
    if (!a?.data || !a?.horaInicio || !a?.horaFim || !a?.paciente || !a?.tipo) {
      throw new Error('Campos obrigatorios ausentes.');
    }
    if (!a?.dentistaId || !a?.dentistaNome) {
      throw new Error('Dentista obrigatorio.');
    }
    if (!a?.clinicId) {
      throw new Error('Clinica obrigatoria no agendamento.');
    }
    if (!agendaStatuses.includes(a.status || 'em_aberto')) {
      throw new Error('Status invalido.');
    }
    const startMin = timeToMinutes(a.horaInicio);
    const endMin = timeToMinutes(a.horaFim);
    if (startMin === null || endMin === null || endMin <= startMin) {
      throw new Error('Horario invalido.');
    }
  };

  const findAgendaById = async (id) => {
    const files = (await fsPromises.readdir(agendaPath)).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const year = f.replace('.json', '');
      const list = await readAgendaYear(year);
      const idx = list.findIndex((item) => item.id === id);
      if (idx !== -1) return { year, list, idx };
    }
    return null;
  };

  const applyRoleFilter = (appointments) => {
    const currentUser = getCurrentUser();
    const clinicId = getCurrentClinicId();
    let filtered = (appointments || []).filter((appt) => String(appt?.clinicId || DEFAULT_CLINIC_ID) === clinicId);
    if (currentUser?.tipo === 'dentista') {
      filtered = filtered.filter((a) => a.dentistaId === currentUser.id);
    }
    return filtered;
  };

  const getRange = async ({ start, end }) => {
    if (!start || !end) return [];
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T23:59:59`);
    const results = [];
    for (let y = s.getFullYear(); y <= e.getFullYear(); y += 1) {
      const list = await readAgendaYear(String(y));
      list.forEach((a) => {
        const d = new Date(`${a.data}T00:00:00`);
        if (d >= s && d <= e) results.push(a);
      });
    }
    return applyRoleFilter(results);
  };

  const getDay = async (payload) => {
    const date = typeof payload === 'string' ? payload : payload?.date;
    if (!date) return [];

    const year = String(new Date(`${date}T00:00:00`).getFullYear());
    const list = await readAgendaYear(year);
    const filtered = list.filter((a) => a.data === date);
    return applyRoleFilter(filtered);
  };

  const syncConsultasForPatient = async (patientKey) => {
    const resolvedKey = await resolvePatientKey(patientKey);
    if (!resolvedKey) return { total: 0 };
    const patient = await readPatientFile(resolvedKey);
    if (!patient) return { total: 0 };

    const currentClinicId = getCurrentClinicId();
    const patientClinicId = String(patient.clinicId || DEFAULT_CLINIC_ID);
    if (patientClinicId !== currentClinicId) {
      throw new Error('Paciente pertence a outra clinica.');
    }

    const keys = [
      resolvedKey,
      patient.prontuario,
      patient.id,
      patient._id,
      patient.pacienteId,
    ]
      .filter(Boolean)
      .map((v) => String(v));

    if (!keys.length) return { total: 0 };

    const files = (await fsPromises.readdir(agendaPath)).filter((f) => f.endsWith('.json'));
    const consultas = [];

    for (const f of files) {
      const year = f.replace('.json', '');
      const list = await readAgendaYear(year);
      list.forEach((appt) => {
        if (String(appt?.clinicId || DEFAULT_CLINIC_ID) !== patientClinicId) return;
        const match = [appt.prontuario, appt.pacienteId, appt.patientId]
          .filter(Boolean)
          .some((val) => keys.includes(String(val)));
        if (!match) return;
        consultas.push(buildConsultaPayload(appt));
      });
    }

    consultas.sort((a, b) => {
      const da = new Date(`${a.data || ''}T00:00:00`).getTime() || 0;
      const db = new Date(`${b.data || ''}T00:00:00`).getTime() || 0;
      if (da !== db) return da - db;
      return String(a.horaInicio || '').localeCompare(String(b.horaInicio || ''));
    });

    patient.consultas = consultas;
    await writePatientFile(resolvedKey, patient);

    return {
      total: consultas.length,
      consultas,
    };
  };

  const addAppointment = async (appt) => {
    const currentUser = getCurrentUser();
    const clinicId = getCurrentClinicId();
    const baseAppt = { ...appt, clinicId };
    baseAppt.perfil = appt?.perfil || currentUser?.tipo || '';
    const patientKey = appt?.prontuario || appt?.pacienteId || appt?.patientId || '';
    let patient = null;

    if (patientKey) {
      const resolvedKey = await resolvePatientKey(patientKey);
      const filePath = getPatientFilePath(resolvedKey || patientKey);
      if (filePath && await pathExists(filePath)) {
        patient = await readJsonFile(filePath);
        if (!patient.clinicId) {
          patient.clinicId = DEFAULT_CLINIC_ID;
          await writeJsonFile(filePath, patient);
        }
        if (String(patient.clinicId || DEFAULT_CLINIC_ID) !== clinicId) {
          throw new Error('Paciente pertence a outra clinica.');
        }
        baseAppt.prontuario = baseAppt.prontuario || patient.prontuario || resolvedKey || patientKey;
      }
    }

    const isDentistaUser = currentUser?.tipo === 'dentista';
    const hasPatient = !!patient;
    const patientDentId = patient?.dentistaId || '';
    const patientDentNome = patient?.dentistaNome || '';
    const perfilSolicitante = baseAppt.perfil || (isDentistaUser ? 'dentista' : currentUser?.tipo || '');

    if (isDentistaUser) {
      baseAppt.dentistaId = currentUser.id;
      baseAppt.dentistaNome = currentUser.nome;
      if (hasPatient) {
        if (!patientDentId) {
          throw new Error('Paciente sem dentista atribuido. Solicite atribuicao antes de agendar.');
        }
        if (patientDentId !== currentUser.id) {
          throw new Error('Paciente pertence a outro dentista. Solicite transferencia.');
        }
        baseAppt.dentistaId = patientDentId;
        baseAppt.dentistaNome = patientDentNome || currentUser.nome;
      }
    } else {
      const users = await readUsers();
      const targetId = baseAppt.dentistaId || appt?.dentistaId || patientDentId || '';
      if (hasPatient && patientDentId && patientDentId !== targetId && perfilSolicitante === 'dentista') {
        throw new Error('Paciente possui dentista diferente.');
      }
      if (!targetId) throw new Error('Dentista obrigatorio para agendamento.');

      const dent = users.find((u) => u.id === targetId && u.tipo === 'dentista' && String(u.clinicId || DEFAULT_CLINIC_ID) === clinicId);
      if (!dent) throw new Error('Dentista invalido para esta clinica.');
      baseAppt.dentistaId = targetId;
      baseAppt.dentistaNome = appt?.dentistaNome || patientDentNome || dent.nome;

      if (!baseAppt.dentistaNome) {
        baseAppt.dentistaNome = dent.nome;
      }
    }

    baseAppt.horaInicio = normalizeTimeInput(baseAppt.horaInicio);
    baseAppt.horaFim = normalizeTimeInput(baseAppt.horaFim);
    baseAppt.status = baseAppt.status || 'em_aberto';

    validateAppt(baseAppt);

    const tempo = getDataHoraAtual();
    const year = String(new Date(`${baseAppt.data}T00:00:00`).getFullYear());
    const list = await readAgendaYear(year);

    const payload = {
      ...baseAppt,
      id: generateAppointmentId(baseAppt),
      dataCriacao: tempo.data,
      horaCriacao: tempo.hora,
    };

    if (hasConflict(list, payload)) {
      throw new Error('Conflito de horario para este dentista.');
    }

    list.push(payload);
    await writeAgendaYear(year, list);

    const consultaKey = payload.prontuario || payload.pacienteId || payload.patientId || '';
    if (consultaKey) {
      await upsertPatientConsulta(consultaKey, payload);
    }

    return payload;
  };

  const updateAppointment = async ({ id, appt }) => {
    if (!id) throw new Error('ID e obrigatorio.');

    const found = await findAgendaById(id);
    if (!found) throw new Error('Agendamento nao encontrado.');

    const clinicId = getCurrentClinicId();
    const existing = found.list[found.idx];
    if (String(existing?.clinicId || DEFAULT_CLINIC_ID) !== clinicId) {
      throw new Error('Acesso negado a agendamento de outra clinica.');
    }

    const currentUser = getCurrentUser();
    const merged = { ...existing, ...appt, clinicId };

    if (currentUser?.tipo === 'dentista') {
      if (merged.dentistaId && merged.dentistaId !== currentUser.id) {
        throw new Error('Dentista nao autorizado.');
      }
      merged.dentistaId = currentUser.id;
      merged.dentistaNome = currentUser.nome;
    } else {
      const users = await readUsers();
      const dentId = appt?.dentistaId || merged.dentistaId;
      const dentNome = appt?.dentistaNome || merged.dentistaNome;
      const dent = users.find((u) => u.id === dentId && u.tipo === 'dentista' && String(u.clinicId || DEFAULT_CLINIC_ID) === clinicId);
      if (!dent && (!dentId || !dentNome)) {
        throw new Error('Dentista obrigatorio.');
      }
      if (dent) {
        merged.dentistaId = dent.id;
        merged.dentistaNome = dent.nome;
      } else {
        merged.dentistaId = dentId;
        merged.dentistaNome = dentNome;
      }
    }

    merged.horaInicio = normalizeTimeInput(merged.horaInicio);
    merged.horaFim = normalizeTimeInput(merged.horaFim);
    validateAppt(merged);

    const newYear = String(new Date(`${merged.data}T00:00:00`).getFullYear());
    const oldKey = existing?.prontuario || existing?.pacienteId || existing?.patientId || '';
    const newKey = merged.prontuario || merged.pacienteId || merged.patientId || '';

    if (newYear === found.year) {
      if (hasConflict(found.list, merged, id)) {
        throw new Error('Conflito de horario para este dentista.');
      }
      found.list[found.idx] = merged;
      await writeAgendaYear(found.year, found.list);
      if (oldKey && (!newKey || String(oldKey) !== String(newKey))) {
        await removePatientConsulta(oldKey, merged.id);
      }
      if (newKey) {
        await upsertPatientConsulta(newKey, merged);
      }
      return merged;
    }

    found.list.splice(found.idx, 1);
    await writeAgendaYear(found.year, found.list);

    const dest = await readAgendaYear(newYear);
    if (hasConflict(dest, merged, id)) {
      throw new Error('Conflito de horario para este dentista.');
    }
    dest.push(merged);
    await writeAgendaYear(newYear, dest);
    if (oldKey && (!newKey || String(oldKey) !== String(newKey))) {
      await removePatientConsulta(oldKey, merged.id);
    }
    if (newKey) {
      await upsertPatientConsulta(newKey, merged);
    }

    return merged;
  };

  const deleteAppointment = async ({ id }) => {
    if (!id) throw new Error('ID obrigatorio.');

    const found = await findAgendaById(id);
    if (!found) throw new Error('Agendamento nao encontrado.');

    const clinicId = getCurrentClinicId();
    const existing = found.list[found.idx];
    if (String(existing?.clinicId || DEFAULT_CLINIC_ID) !== clinicId) {
      throw new Error('Acesso negado a agendamento de outra clinica.');
    }

    const consultaKey = existing?.prontuario || existing?.pacienteId || existing?.patientId || '';

    found.list.splice(found.idx, 1);
    await writeAgendaYear(found.year, found.list);
    if (consultaKey) {
      await removePatientConsulta(consultaKey, id);
    }

    return { success: true };
  };

  return {
    generateAppointmentId,
    readAgendaYear,
    writeAgendaYear,
    getRange,
    getDay,
    addAppointment,
    updateAppointment,
    deleteAppointment,
    syncConsultasForPatient,
  };
};

module.exports = { createAgendaService };
