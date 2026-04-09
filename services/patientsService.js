const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const createPatientsService = ({
  patientsPath,
  readJsonFile,
  writeJsonFile,
  pathExists,
  fsPromises,
  getCurrentUser,
  readUsers,
}) => {
  const patientCache = new Map();
  let patientIndexLoaded = false;

  const getCurrentClinicId = () => {
    const user = getCurrentUser?.() || null;
    return String(user?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  };

  const filterByClinic = (patients) => {
    const clinicId = getCurrentClinicId();
    return (patients || []).filter((patient) => String(patient?.clinicId || DEFAULT_CLINIC_ID) === clinicId);
  };

  const loadAllPatients = async () => {
    if (patientIndexLoaded) return Array.from(patientCache.values());

    const list = [];
    if (!(await pathExists(patientsPath))) return [];

    const files = await fsPromises.readdir(patientsPath);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(patientsPath, file);
        const patient = await readJsonFile(filePath);

        if (!patient?.prontuario) {
          continue;
        }

        if (!patient.clinicId) {
          patient.clinicId = DEFAULT_CLINIC_ID;
          await writeJsonFile(filePath, patient);
        }

        patientCache.set(patient.prontuario, patient);
        list.push(patient);
      } catch (err) {
        console.error(`Erro ao ler paciente ${file}:`, err);
      }
    }

    patientIndexLoaded = true;
    return list;
  };

  const listPatients = async () => {
    const all = filterByClinic(await loadAllPatients());
    const currentUser = getCurrentUser();
    if (currentUser?.tipo === 'dentista') {
      return all.filter((p) => p.dentistaId === currentUser.id);
    }
    return all;
  };

  const searchPatients = async (query) => {
    if (!query || typeof query !== 'string' || query.trim() === '') return [];

    const allPatients = filterByClinic(await loadAllPatients());
    const currentUser = getCurrentUser();
    const baseList = currentUser?.tipo === 'dentista'
      ? allPatients.filter((p) => p.dentistaId === currentUser.id)
      : allPatients;

    const q = query.toLowerCase().trim();
    const qDigits = query.replace(/\D/g, '');

    const filtered = baseList.filter((p) => {
      const nome = (p.fullName || p.nome || '').toLowerCase();
      const cpfDigits = (p.cpf || '').replace(/\D/g, '');
      return nome.includes(q) || (qDigits && cpfDigits.includes(qDigits));
    });

    return filtered.map((p) => ({
      id: p.id || p.prontuario || p._id || '',
      nome: p.fullName || p.nome || '',
      cpf: p.cpf || '',
    }));
  };

  const deletePatient = async (prontuario) => {
    if (!prontuario) throw new Error('Prontuario obrigatorio.');
    const filePath = path.join(patientsPath, `${prontuario}.json`);
    if (!(await pathExists(filePath))) throw new Error('Paciente nao encontrado.');

    const currentClinicId = getCurrentClinicId();
    const patient = await readJsonFile(filePath);
    if (String(patient?.clinicId || DEFAULT_CLINIC_ID) !== currentClinicId) {
      throw new Error('Acesso negado a paciente de outra clinica.');
    }

    await fsPromises.unlink(filePath);
    patientCache.delete(prontuario);
    patientIndexLoaded = false;
    return { success: true };
  };

  const savePatient = async (patientData) => {
    const currentUser = getCurrentUser();
    const currentClinicId = getCurrentClinicId();
    const { prontuario } = patientData;
    if (!prontuario) throw new Error('Prontuario obrigatorio.');

    const finalPath = path.join(patientsPath, `${prontuario}.json`);

    let existing = {};
    if (await pathExists(finalPath)) {
      existing = await readJsonFile(finalPath);
      const existingClinicId = String(existing?.clinicId || DEFAULT_CLINIC_ID);
      if (existingClinicId !== currentClinicId) {
        throw new Error('Paciente pertence a outra clinica.');
      }
    }

    const isDentistaUser = currentUser?.tipo === 'dentista';

    const targetDentistaId = patientData?.dentistaId !== undefined
      ? String(patientData.dentistaId || '').trim()
      : String(existing.dentistaId || '').trim();
    let dentistaId = '';
    let dentistaNome = '';

    if (isDentistaUser) {
      if (existing.dentistaId && existing.dentistaId !== currentUser.id) {
        throw new Error('Paciente pertence a outro dentista. Solicite transferencia ao administrador.');
      }
      if (targetDentistaId && targetDentistaId !== currentUser.id) {
        throw new Error('Dentista nao autorizado a alterar a atribuicao.');
      }
      if (targetDentistaId) {
        dentistaId = targetDentistaId;
        dentistaNome = existing.dentistaNome || currentUser.nome || '';
      }
    } else {
      if (targetDentistaId) {
        const users = await readUsers();
        const d = users.find((u) => u.id === targetDentistaId && u.tipo === 'dentista' && String(u.clinicId || DEFAULT_CLINIC_ID) === currentClinicId);
        if (!d) throw new Error('Dentista invalido para esta clinica.');
        dentistaId = d.id;
        dentistaNome = d.nome;
      }
    }

    const normalizedBirthDate = patientData?.dataNascimento
      || patientData?.birthDate
      || existing?.dataNascimento
      || existing?.birthDate
      || '';
    const normalizedRg = patientData?.rg || existing?.rg || '';
    const normalizedAllowsMessages = typeof patientData?.allowsMessages === 'boolean'
      ? patientData.allowsMessages
      : (typeof existing?.allowsMessages === 'boolean' ? existing.allowsMessages : true);

    const merged = {
      ...existing,
      ...patientData,
      clinicId: currentClinicId,
      dentistaId,
      dentistaNome,
      dataNascimento: normalizedBirthDate,
      birthDate: normalizedBirthDate,
      rg: normalizedRg,
      allowsMessages: normalizedAllowsMessages,
      servicos: patientData.servicos ?? existing.servicos ?? [],
    };

    merged.fullName = merged.fullName || merged.nome || '';

    await writeJsonFile(finalPath, merged);

    patientCache.set(prontuario, merged);
    patientIndexLoaded = false;

    return { success: true };
  };

  const updateDentist = async ({ prontuario, novoDentistaId }) => {
    if (!prontuario || !novoDentistaId) throw new Error('Dados invalidos.');

    const filePath = path.join(patientsPath, `${prontuario}.json`);
    if (!(await pathExists(filePath))) throw new Error('Paciente nao encontrado.');

    const currentClinicId = getCurrentClinicId();
    const users = await readUsers();
    const dent = users.find((u) => u.id === novoDentistaId && u.tipo === 'dentista' && String(u.clinicId || DEFAULT_CLINIC_ID) === currentClinicId);
    if (!dent) throw new Error('Dentista invalido.');

    const patient = await readJsonFile(filePath);
    if (String(patient?.clinicId || DEFAULT_CLINIC_ID) !== currentClinicId) {
      throw new Error('Acesso negado a paciente de outra clinica.');
    }

    patient.clinicId = currentClinicId;
    patient.dentistaId = dent.id;
    patient.dentistaNome = dent.nome;

    await writeJsonFile(filePath, patient);
    patientCache.set(prontuario, patient);
    patientIndexLoaded = false;

    return {
      success: true,
      patient: {
        prontuario,
        fullName: patient.fullName || patient.nome || '',
        cpf: patient.cpf || '',
        dentistaId: patient.dentistaId,
        dentistaNome: patient.dentistaNome,
      },
    };
  };

  const readPatient = async (prontuario) => {
    const currentUser = getCurrentUser();
    const currentClinicId = getCurrentClinicId();
    const filePath = path.join(patientsPath, `${prontuario}.json`);
    try {
      if (!(await pathExists(filePath))) {
        throw new Error('Arquivo do paciente nao encontrado.');
      }
      const patient = await readJsonFile(filePath);
      if (String(patient?.clinicId || DEFAULT_CLINIC_ID) !== currentClinicId) {
        throw new Error('Paciente pertence a outra clinica.');
      }
      const servicos = Array.isArray(patient.servicos) ? patient.servicos : [];
      if (currentUser?.tipo === 'dentista') {
        if (patient.dentistaId && patient.dentistaId !== currentUser.id) {
          throw new Error('Paciente pertence a outro dentista. Solicite transferencia.');
        }
      }
      const selfieFullPath = patient.selfiePath ? path.join(patientsPath, patient.selfiePath) : '';
      const result = {
        nome: patient.fullName || patient.nome,
        cpf: patient.cpf,
        prontuario: patient.prontuario,
        servicos,
        dataNascimento: patient.dataNascimento || patient.birthDate || '',
        birthDate: patient.birthDate || patient.dataNascimento || '',
        rg: patient.rg || '',
        allowsMessages: typeof patient.allowsMessages === 'boolean' ? patient.allowsMessages : true,
        selfieUrl: selfieFullPath ? `file://${selfieFullPath.replace(/\\/g, '/')}` : '',
        ...patient,
      };
      patientCache.set(prontuario, result);
      return result;
    } catch (error) {
      console.error('Erro ao ler dados do paciente:', error);
      throw new Error('Falha ao obter os dados do paciente.');
    }
  };

  const findPatient = async (query) => {
    if (!query) return null;

    const all = filterByClinic(await loadAllPatients());
    const currentUser = getCurrentUser();
    const baseList = currentUser?.tipo === 'dentista'
      ? all.filter((p) => p.dentistaId === currentUser.id)
      : all;
    const terms = [];
    if (typeof query === 'string') terms.push(query);
    if (typeof query === 'object') {
      if (query.prontuario) terms.push(query.prontuario);
      if (query.cpf) terms.push(query.cpf);
      if (query.fullName) terms.push(query.fullName);
      if (query.nome) terms.push(query.nome);
    }
    const normalized = terms.map((t) => String(t || '').trim()).filter(Boolean);
    if (normalized.length === 0) return null;

    const matchPatient = (patient, term) => {
      const q = term.toLowerCase();
      const cpfDigits = term.replace(/\D/g, '');
      return (patient.prontuario && patient.prontuario.toLowerCase() === q)
        || (patient.cpf && patient.cpf.replace(/\D/g, '') === cpfDigits && cpfDigits)
        || (patient.fullName && patient.fullName.toLowerCase() === q)
        || (patient.nome && patient.nome.toLowerCase() === q);
    };

    for (const term of normalized) {
      const found = baseList.find((p) => matchPatient(p, term));
      if (found) return found;
    }
    return null;
  };

  return {
    loadAllPatients,
    listPatients,
    searchPatients,
    deletePatient,
    savePatient,
    updateDentist,
    readPatient,
    findPatient,
  };
};

module.exports = { createPatientsService };
