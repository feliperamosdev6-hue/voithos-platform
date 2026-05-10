const { AppError } = require('../errors/AppError');
const { patientRepository } = require('../repositories/patientRepository');
const { patientClinicalRepository } = require('../repositories/patientClinicalRepository');
const { userRepository } = require('../repositories/userRepository');
const { assertRecordBelongsToClinic, sanitizeTenantInput } = require('../utils/tenantScope');

const isMissingTableError = (error) => error && error.code === 'P2021';
const isForeignKeyError = (error) => error && error.code === 'P2003';
const GENERATED_DOCUMENT_TYPES = new Set(['ANAMNESE', 'RECEITA', 'ATESTADO', 'CONTRATO', 'DOSSIE', 'ORCAMENTO', 'CUSTOMIZAVEL']);
const IGNORED_DOCUMENT_TYPES = new Set(['EVOLUCAO', 'EVOLUCAO_CLINICA']);
const ATTACHMENT_CATEGORY_ALIASES = new Set(['ARQUIVO_PACIENTE', 'ARQUIVOS', 'ANEXO', 'ANEXOS', 'EXAMES', 'IDENTIDADE', 'FINANCEIRO', 'IMAGEM', 'IMAGENS', 'OUTROS', 'CLINICOS']);
const isMimeLikeType = (value) => /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(value || '').trim());
const isAttachmentSummary = (doc = {}) => {
  const type = String(doc?.type || '').trim().toUpperCase();
  const category = String(doc?.category || '').trim().toUpperCase();
  if (GENERATED_DOCUMENT_TYPES.has(type) || IGNORED_DOCUMENT_TYPES.has(type)) return false;
  if (ATTACHMENT_CATEGORY_ALIASES.has(category)) return true;
  if (type === 'ARQUIVO' || type === 'ANEXO' || type === 'IMAGEM') return true;
  if (isMimeLikeType(doc?.type || '')) return true;
  return Boolean(doc?.storedName || doc?.originalName || doc?.extension);
};
const buildAttachmentCountMap = (documents = []) => {
  const counts = new Map();
  (Array.isArray(documents) ? documents : []).forEach((doc) => {
    const patientId = String(doc?.patientId || '').trim();
    if (!patientId || !isAttachmentSummary(doc)) return;
    counts.set(patientId, (counts.get(patientId) || 0) + 1);
  });
  return counts;
};

const cleanText = (value) => String(value || '').trim();

const getPatientProfileSummary = (patient = {}) => {
  const summary = patient?.clinicalRecord?.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return {};
  const profile = summary.patientProfile;
  if (profile && typeof profile === 'object' && !Array.isArray(profile)) return profile;
  return {};
};

const decoratePatient = (patient) => {
  if (!patient) return patient;
  const { clinicalRecord, ...base } = patient;
  const profile = getPatientProfileSummary(patient);
  return {
    ...base,
    dentistaId: cleanText(profile.dentistaId),
    dentistaNome: cleanText(profile.dentistaNome),
    notes: cleanText(profile.notes || profile.observacoes),
    observacoes: cleanText(profile.observacoes || profile.notes),
  };
};

const hasOwn = (payload, key) => Object.prototype.hasOwnProperty.call(payload || {}, key);

const buildPatientProfilePatch = (input = {}) => {
  const patch = {};
  if (hasOwn(input, 'dentistaId')) patch.dentistaId = cleanText(input.dentistaId);
  if (hasOwn(input, 'dentistaNome')) patch.dentistaNome = cleanText(input.dentistaNome);
  if (hasOwn(input, 'notes')) {
    patch.notes = cleanText(input.notes);
    patch.observacoes = cleanText(input.notes);
  } else if (hasOwn(input, 'observacoes')) {
    patch.notes = cleanText(input.observacoes);
    patch.observacoes = cleanText(input.observacoes);
  }
  return patch;
};

const validateDentistPatchForClinic = async ({ clinicId, patch }) => {
  if (!hasOwn(patch, 'dentistaId') || !patch.dentistaId) return patch;
  const dentist = await userRepository.findById(patch.dentistaId);
  const role = cleanText(dentist?.role).toUpperCase();
  if (!dentist || cleanText(dentist.clinicId) !== cleanText(clinicId) || role !== 'DENTISTA' || dentist.ativo === false) {
    throw new AppError(400, 'INVALID_DENTIST_FOR_CLINIC', 'Dentista invalido para esta clinica.');
  }
  return {
    ...patch,
    dentistaId: dentist.id,
    dentistaNome: cleanText(dentist.nome),
  };
};

const mergeProfileSummary = (currentPatient = {}, patch = {}) => {
  const currentSummary = currentPatient?.clinicalRecord?.summary;
  const safeSummary = currentSummary && typeof currentSummary === 'object' && !Array.isArray(currentSummary)
    ? currentSummary
    : {};
  const currentProfile = safeSummary.patientProfile && typeof safeSummary.patientProfile === 'object' && !Array.isArray(safeSummary.patientProfile)
    ? safeSummary.patientProfile
    : {};
  return {
    ...safeSummary,
    patientProfile: {
      ...currentProfile,
      ...patch,
    },
  };
};

const patientService = {
  listByClinic: async (clinicId) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    try {
      const [patients, documentSummaries] = await Promise.all([
        patientRepository.listByClinic(normalizedClinicId),
        patientClinicalRepository.listDocumentSummariesByClinic({ clinicId: normalizedClinicId }).catch((error) => {
          if (isMissingTableError(error)) return [];
          throw error;
        }),
      ]);
      const attachmentCountMap = buildAttachmentCountMap(documentSummaries);
      return (patients || []).map((patient) => ({
        ...decoratePatient(patient),
        attachmentCount: attachmentCountMap.get(String(patient?.id || '').trim()) || 0,
      }));
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      throw error;
    }
  },

  findById: async (id) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }

    try {
      return decoratePatient(await patientRepository.findById(normalizedId));
    } catch (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      throw error;
    }
  },

  findByIdForClinic: async (id, clinicId) => {
    const normalizedId = String(id || '').trim();
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    try {
      const patient = await patientRepository.findById(normalizedId);
      return decoratePatient(assertRecordBelongsToClinic(patient, normalizedClinicId, 'PATIENT_NOT_FOUND'));
    } catch (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      throw error;
    }
  },

  create: async (input) => {
    const clinicId = String(input?.clinicId || '').trim();
    const nome = String(input?.nome || '').trim();

    if (!clinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    if (!nome) {
      throw new AppError(400, 'VALIDATION_ERROR', 'nome is required.');
    }

    try {
      const created = await patientRepository.create({
        clinicId,
        nome,
        cpf: input?.cpf,
        rg: input?.rg,
        dataNascimento: input?.dataNascimento,
        telefone: input?.telefone,
        email: input?.email,
        endereco: input?.endereco,
        allowsMessages: input?.allowsMessages,
        lastBirthdayMessageAt: input?.lastBirthdayMessageAt,
        birthdayMessageYear: input?.birthdayMessageYear,
      });
      const profilePatch = await validateDentistPatchForClinic({
        clinicId,
        patch: buildPatientProfilePatch(input),
      });
      if (Object.keys(profilePatch).length > 0) {
        await patientClinicalRepository.upsertClinicalRecordSummary({
          clinicId,
          patientId: created.id,
          summary: mergeProfileSummary(created, profilePatch),
        });
        return decoratePatient(await patientRepository.findById(created.id));
      }
      return decoratePatient(created);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  createForClinic: async (clinicId, input) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const sanitizedInput = sanitizeTenantInput(input);
    const nome = String(sanitizedInput?.nome || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    if (!nome) {
      throw new AppError(400, 'VALIDATION_ERROR', 'nome is required.');
    }

    try {
      const created = await patientRepository.create({
        clinicId: normalizedClinicId,
        nome,
        cpf: sanitizedInput?.cpf,
        rg: sanitizedInput?.rg,
        dataNascimento: sanitizedInput?.dataNascimento,
        telefone: sanitizedInput?.telefone,
        email: sanitizedInput?.email,
        endereco: sanitizedInput?.endereco,
        allowsMessages: sanitizedInput?.allowsMessages,
        lastBirthdayMessageAt: sanitizedInput?.lastBirthdayMessageAt,
        birthdayMessageYear: sanitizedInput?.birthdayMessageYear,
      });
      const profilePatch = await validateDentistPatchForClinic({
        clinicId: normalizedClinicId,
        patch: buildPatientProfilePatch(sanitizedInput),
      });
      if (Object.keys(profilePatch).length > 0) {
        await patientClinicalRepository.upsertClinicalRecordSummary({
          clinicId: normalizedClinicId,
          patientId: created.id,
          summary: mergeProfileSummary(created, profilePatch),
        });
        return decoratePatient(await patientRepository.findById(created.id));
      }
      return decoratePatient(created);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  updateForClinic: async ({ id, clinicId, input }) => {
    const normalizedId = String(id || '').trim();
    const normalizedClinicId = String(clinicId || '').trim();
    const sanitizedInput = sanitizeTenantInput(input);
    const nome = String(sanitizedInput?.nome || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }

    if (!nome) {
      throw new AppError(400, 'VALIDATION_ERROR', 'nome is required.');
    }

    try {
      const current = await patientRepository.findById(normalizedId);
      assertRecordBelongsToClinic(current, normalizedClinicId, 'PATIENT_NOT_FOUND');
      const profilePatch = await validateDentistPatchForClinic({
        clinicId: normalizedClinicId,
        patch: buildPatientProfilePatch(sanitizedInput),
      });

      const result = await patientRepository.update({
        id: normalizedId,
        clinicId: normalizedClinicId,
        data: {
          nome,
          cpf: sanitizedInput?.cpf,
          rg: sanitizedInput?.rg,
          dataNascimento: sanitizedInput?.dataNascimento,
          telefone: sanitizedInput?.telefone,
          email: sanitizedInput?.email,
          endereco: sanitizedInput?.endereco,
          allowsMessages: sanitizedInput?.allowsMessages,
          lastBirthdayMessageAt: sanitizedInput?.lastBirthdayMessageAt,
          birthdayMessageYear: sanitizedInput?.birthdayMessageYear,
        },
      });

      if (!result.count) {
        throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found.');
      }

      if (Object.keys(profilePatch).length > 0) {
        await patientClinicalRepository.upsertClinicalRecordSummary({
          clinicId: normalizedClinicId,
          patientId: normalizedId,
          summary: mergeProfileSummary(current, profilePatch),
        });
      }

      return decoratePatient(await patientRepository.findById(normalizedId));
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  deleteForClinic: async ({ id, clinicId }) => {
    const normalizedId = String(id || '').trim();
    const normalizedClinicId = String(clinicId || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }

    try {
      const current = await patientRepository.findById(normalizedId);
      assertRecordBelongsToClinic(current, normalizedClinicId, 'PATIENT_NOT_FOUND');

      const result = await patientRepository.delete({
        id: normalizedId,
        clinicId: normalizedClinicId,
      });

      if (!result.count) {
        throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found.');
      }

      return { success: true };
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      if (isForeignKeyError(error)) {
        throw new AppError(409, 'PATIENT_HAS_APPOINTMENTS', 'Patient has linked appointments.');
      }
      throw error;
    }
  },
};

module.exports = { patientService };
