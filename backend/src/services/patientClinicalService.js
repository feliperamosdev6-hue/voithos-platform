const { AppError } = require('../errors/AppError');
const { patientRepository } = require('../repositories/patientRepository');
const { patientClinicalRepository } = require('../repositories/patientClinicalRepository');
const { patientDocumentStorageService } = require('./patientDocumentStorageService');

const assertPatientBelongsToClinic = async ({ clinicId, patientId }) => {
  const patient = await patientRepository.findById(patientId);
  if (!patient || String(patient.clinicId || '').trim() !== String(clinicId || '').trim()) {
    throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found for this clinic.');
  }
  return patient;
};

const normalizeIsoDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) return new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00.000Z`);
  return null;
};

const mapProcedureToLegacy = (row = {}) => {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    ...payload,
    id: row.externalId || row.id,
    centralProcedureId: row.id,
    patientId: row.patientId,
    clinicId: row.clinicId,
    appointmentId: row.appointmentId || payload.appointmentId || '',
    codigo: row.procedureCode || payload.codigo || payload.code || '',
    nome: row.name || payload.nome || payload.tipo || '',
    tipo: payload.tipo || row.name || '',
    status: row.status || payload.status || '',
    observacoes: row.observations || payload.observacoes || payload.obs || '',
    dentistaId: row.dentistId || payload.dentistaId || '',
    dentistaNome: row.dentistName || payload.dentistaNome || '',
    registeredAt: row.registeredAt ? row.registeredAt.toISOString() : (payload.registeredAt || ''),
    dataRealizacao: row.performedAt ? row.performedAt.toISOString() : (payload.dataRealizacao || ''),
    financeiro: payload.financeiro || {},
    integracoes: payload.integracoes || {},
  };
};

const mapDocumentToLegacy = (row = {}) => {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const nestedData = metadata?.data && typeof metadata.data === 'object'
    ? metadata.data
    : (
      metadata?.metadata && typeof metadata.metadata === 'object'
        ? metadata.metadata
        : {}
    );
  return {
    id: row.externalDocumentId || row.id,
    centralDocumentId: row.id,
    prontuario: metadata.prontuario || '',
    category: row.category || metadata.category || metadata.categoria || '',
    categoria: row.category || metadata.categoria || metadata.category || '',
    type: row.type || metadata.type || metadata.tipo || '',
    title: row.title || metadata.title || metadata.titulo || '',
    titulo: row.title || metadata.titulo || metadata.title || '',
    notes: metadata.notes || metadata.observacoes || '',
    folder: metadata.folder || metadata.pasta || '',
    atendimentoId: metadata.atendimentoId || '',
    documentDate: row.documentDate ? row.documentDate.toISOString().split('T')[0] : (metadata.documentDate || ''),
    createdAt: row.createdAt?.toISOString?.() || '',
    updatedAt: metadata.updatedAt || '',
    createdBy: metadata.createdBy || {
      id: row.createdByUserId || '',
      nome: row.createdByName || '',
    },
    updatedBy: metadata.updatedBy || null,
    dentistaId: metadata.dentistaId || '',
    originalName: row.originalName || metadata.originalName || '',
    storedName: row.storedName || metadata.storedName || '',
    extension: row.extension || metadata.extension || '',
    size: row.size ?? metadata.size ?? null,
    sourceJsonName: metadata.sourceJsonName || '',
    sourceJsonSize: metadata.sourceJsonSize ?? null,
    versionOf: metadata.versionOf || row.externalDocumentId || row.id,
    version: Number(metadata.version) || 1,
    isLatest: metadata.isLatest !== false,
    archived: Boolean(row.archived),
    archivedAt: row.archivedAt?.toISOString?.() || null,
    archivedBy: metadata.archivedBy || null,
    localPath: row.localPath || metadata.localPath || '',
    data: nestedData,
    metadata,
  };
};

const patientClinicalService = {
  getClinicalRecord: async ({ clinicId, patientId }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPatientId = String(patientId || '').trim();
    if (!normalizedClinicId || !normalizedPatientId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and patientId are required.');
    }
    await assertPatientBelongsToClinic({ clinicId: normalizedClinicId, patientId: normalizedPatientId });
    const record = await patientClinicalRepository.ensureClinicalRecord({
      clinicId: normalizedClinicId,
      patientId: normalizedPatientId,
    });
    return record;
  },

  listProcedures: async ({ clinicId, patientId }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const rows = await patientClinicalRepository.listProcedures({ clinicId, patientId });
    return rows.map(mapProcedureToLegacy);
  },

  upsertProcedure: async ({ clinicId, patientId, procedure }) => {
    const record = await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const externalId = String(procedure?.id || procedure?.externalId || '').trim();
    if (!externalId) throw new AppError(400, 'VALIDATION_ERROR', 'procedure.id is required.');

    const payload = { ...(procedure || {}) };
    const existing = await patientClinicalRepository.findProcedureByExternalId({
      clinicId,
      patientId,
      externalId,
    });

    const data = {
      clinicId,
      patientId,
      clinicalRecordId: record.id,
      appointmentId: String(payload.appointmentId || '').trim() || null,
      externalId,
      procedureCode: String(payload.codigo || payload.code || '').trim() || null,
      name: String(payload.nome || payload.tipo || payload.procedimento || 'Procedimento').trim(),
      status: String(payload.status || 'em_aberto').trim(),
      dentistId: String(payload.dentistaId || '').trim() || null,
      dentistName: String(payload.dentistaNome || '').trim() || null,
      tooth: String(payload.dentes || payload.dente || '').trim() || null,
      faces: Array.isArray(payload.faces) ? payload.faces.map((item) => String(item || '').trim()).filter(Boolean) : [],
      observations: String(payload.observacoes || payload.obs || payload.observacao || '').trim() || null,
      registeredAt: normalizeIsoDate(payload.registeredAt || payload.createdAt || payload.dataRegistro),
      performedAt: normalizeIsoDate(payload.dataRealizacao || payload.finishedAt),
      financialSnapshot: payload.financeiro || null,
      payload,
    };

    if (existing) {
      await patientClinicalRepository.updateProcedure({
        id: existing.id,
        clinicId,
        patientId,
        data,
      });
      const updated = await patientClinicalRepository.findProcedureByExternalId({ clinicId, patientId, externalId });
      return mapProcedureToLegacy(updated);
    }

    const created = await patientClinicalRepository.createProcedure(data);
    return mapProcedureToLegacy(created);
  },

  deleteProcedure: async ({ clinicId, patientId, externalId }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const result = await patientClinicalRepository.deleteProcedure({ clinicId, patientId, externalId });
    return { success: result.count > 0 };
  },

  listDocuments: async ({ clinicId, patientId, includeArchived }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const rows = await patientClinicalRepository.listDocuments({ clinicId, patientId, includeArchived });
    return rows.map(mapDocumentToLegacy);
  },

  upsertDocumentMetadata: async ({ clinicId, patientId, document }) => {
    const record = await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const externalDocumentId = String(document?.id || document?.externalDocumentId || '').trim();
    if (!externalDocumentId) throw new AppError(400, 'VALIDATION_ERROR', 'document.id is required.');
    const metadata = { ...(document || {}) };
    const existing = await patientClinicalRepository.findDocumentByExternalId({
      clinicId,
      patientId,
      externalDocumentId,
    });

    const data = {
      clinicId,
      patientId,
      clinicalRecordId: record.id,
      externalDocumentId,
      title: String(metadata.title || metadata.titulo || '').trim() || null,
      category: String(metadata.category || metadata.categoria || '').trim() || null,
      type: String(metadata.type || metadata.tipo || '').trim() || null,
      localPath: String(metadata.localPath || '').trim() || null,
      originalName: String(metadata.originalName || '').trim() || null,
      storedName: String(metadata.storedName || '').trim() || null,
      extension: String(metadata.extension || '').trim() || null,
      size: Number.isFinite(Number(metadata.size)) ? Math.trunc(Number(metadata.size)) : null,
      documentDate: normalizeIsoDate(metadata.documentDate),
      archived: Boolean(metadata.archived),
      archivedAt: metadata.archived ? (normalizeIsoDate(metadata.archivedAt) || new Date()) : null,
      createdByUserId: String(metadata?.createdBy?.id || '').trim() || null,
      createdByName: String(metadata?.createdBy?.nome || '').trim() || null,
      metadata,
    };

    if (existing) {
      await patientClinicalRepository.updateDocument({
        id: existing.id,
        clinicId,
        patientId,
        data,
      });
      const updated = await patientClinicalRepository.findDocumentByExternalId({ clinicId, patientId, externalDocumentId });
      return mapDocumentToLegacy(updated);
    }

    const created = await patientClinicalRepository.createDocument(data);
    return mapDocumentToLegacy(created);
  },

  storeDocumentAsset: async ({ clinicId, patientId, externalDocumentId, role, buffer, fileName, contentType }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    return patientDocumentStorageService.storeDocumentAsset({
      clinicId,
      patientId,
      externalDocumentId,
      role,
      buffer,
      fileName,
      contentType,
    });
  },

  getDocumentAsset: async ({ clinicId, patientId, externalDocumentId, role }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    return patientDocumentStorageService.getDocumentAsset({
      clinicId,
      patientId,
      externalDocumentId,
      role,
    });
  },

  listAnamneses: async ({ clinicId, patientId }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    return patientClinicalRepository.listAnamneses({ clinicId, patientId });
  },

  createAnamnesis: async ({ clinicId, patientId, data, sourceDocument }) => {
    const record = await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    let sourceDocumentId = null;
    if (sourceDocument) {
      const doc = await patientClinicalService.upsertDocumentMetadata({ clinicId, patientId, document: sourceDocument });
      const docRow = await patientClinicalRepository.findDocumentByExternalId({
        clinicId,
        patientId,
        externalDocumentId: String(doc.id || '').trim(),
      });
      sourceDocumentId = docRow?.id || null;
    }

    return patientClinicalRepository.createAnamnesis({
      clinicId,
      patientId,
      clinicalRecordId: record.id,
      sourceDocumentId,
      title: String(sourceDocument?.title || sourceDocument?.titulo || 'Anamnese').trim(),
      data,
      createdByUserId: String(sourceDocument?.createdBy?.id || '').trim() || null,
      createdByName: String(sourceDocument?.createdBy?.nome || '').trim() || null,
      documentDate: normalizeIsoDate(sourceDocument?.documentDate),
    });
  },

  listClinicalNotes: async ({ clinicId, patientId, noteType }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    return patientClinicalRepository.listClinicalNotes({ clinicId, patientId, noteType });
  },

  createClinicalNote: async ({ clinicId, patientId, noteType, content, sourceDocument }) => {
    const record = await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    let sourceDocumentId = null;
    if (sourceDocument) {
      const doc = await patientClinicalService.upsertDocumentMetadata({ clinicId, patientId, document: sourceDocument });
      const docRow = await patientClinicalRepository.findDocumentByExternalId({
        clinicId,
        patientId,
        externalDocumentId: String(doc.id || '').trim(),
      });
      sourceDocumentId = docRow?.id || null;
    }

    return patientClinicalRepository.createClinicalNote({
      clinicId,
      patientId,
      clinicalRecordId: record.id,
      sourceDocumentId,
      noteType: String(noteType || 'EVOLUCAO').trim(),
      title: String(sourceDocument?.title || sourceDocument?.titulo || 'Evolucao').trim(),
      content,
      status: String(content?.status || '').trim() || null,
      createdByUserId: String(sourceDocument?.createdBy?.id || '').trim() || null,
      createdByName: String(sourceDocument?.createdBy?.nome || '').trim() || null,
      noteDate: normalizeIsoDate(sourceDocument?.documentDate),
    });
  },

  updateClinicalNoteBySourceDocument: async ({ clinicId, patientId, sourceDocumentId, content, sourceDocument }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const existing = await patientClinicalRepository.findClinicalNoteBySourceDocumentId({
      clinicId,
      patientId,
      sourceDocumentId,
    });
    if (!existing) {
      throw new AppError(404, 'CLINICAL_NOTE_NOT_FOUND', 'Clinical note not found.');
    }
    await patientClinicalService.upsertDocumentMetadata({ clinicId, patientId, document: sourceDocument });
    await patientClinicalRepository.updateClinicalNote({
      id: existing.id,
      clinicId,
      patientId,
      data: {
        title: String(sourceDocument?.title || sourceDocument?.titulo || existing.title || 'Evolucao').trim(),
        content,
        status: String(content?.status || '').trim() || null,
        noteDate: normalizeIsoDate(sourceDocument?.documentDate),
      },
    });
    return patientClinicalRepository.findClinicalNoteBySourceDocumentId({
      clinicId,
      patientId,
      sourceDocumentId,
    });
  },
};

module.exports = { patientClinicalService, mapProcedureToLegacy, mapDocumentToLegacy };
