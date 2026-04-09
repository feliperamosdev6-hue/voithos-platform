const fs = require('fs');
const path = require('path');
const { appEnv } = require('../config/appEnv');
const { AppError } = require('../errors/AppError');
const { patientRepository } = require('../repositories/patientRepository');
const { patientClinicalRepository } = require('../repositories/patientClinicalRepository');

const VALID_ROLES = new Set(['primary', 'source']);

const sanitizeSegment = (value, fallback = 'item') => {
  const raw = String(value || fallback).trim() || fallback;
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const sanitizeFileName = (value, fallback = 'document.bin') => {
  const raw = String(value || fallback).trim() || fallback;
  const normalized = path.basename(raw).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return normalized || fallback;
};

const getStorageRoot = () =>
  path.resolve(
    String(appEnv.clinicalDocumentsStorageRoot || '').trim()
      || path.join(process.cwd(), 'storage', 'patient-documents')
  );

const ensurePatientDocumentContext = async ({ clinicId, patientId, externalDocumentId }) => {
  const normalizedClinicId = String(clinicId || '').trim();
  const normalizedPatientId = String(patientId || '').trim();
  const normalizedExternalDocumentId = String(externalDocumentId || '').trim();
  if (!normalizedClinicId || !normalizedPatientId || !normalizedExternalDocumentId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId, patientId and externalDocumentId are required.');
  }

  const patient = await patientRepository.findById(normalizedPatientId);
  if (!patient || String(patient.clinicId || '').trim() !== normalizedClinicId) {
    throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found for this clinic.');
  }

  const document = await patientClinicalRepository.findDocumentByExternalId({
    clinicId: normalizedClinicId,
    patientId: normalizedPatientId,
    externalDocumentId: normalizedExternalDocumentId,
  });
  if (!document) {
    throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found for this patient.');
  }

  return {
    clinicId: normalizedClinicId,
    patientId: normalizedPatientId,
    externalDocumentId: normalizedExternalDocumentId,
    patient,
    document,
  };
};

const resolveRole = (role) => {
  const normalizedRole = String(role || 'primary').trim().toLowerCase() || 'primary';
  if (!VALID_ROLES.has(normalizedRole)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'role must be primary or source.');
  }
  return normalizedRole;
};

const getDocumentMetadata = (document) =>
  document?.metadata && typeof document.metadata === 'object' ? { ...document.metadata } : {};

const resolveFallbackFileName = (document, role) => {
  const metadata = getDocumentMetadata(document);
  if (role === 'source') {
    const sourceJsonName = sanitizeFileName(metadata.sourceJsonName || '', '');
    if (!sourceJsonName) {
      throw new AppError(404, 'DOCUMENT_SOURCE_NOT_FOUND', 'Document source file is not available.');
    }
    return sourceJsonName;
  }

  const preferred = sanitizeFileName(
    document?.storedName || document?.originalName || metadata.storedName || metadata.originalName || '',
    ''
  );
  if (!preferred) {
    const extension = String(document?.extension || metadata.extension || '.bin').trim() || '.bin';
    return `${sanitizeSegment(document?.externalDocumentId || document?.id || 'document')}${extension.startsWith('.') ? extension : `.${extension}`}`;
  }
  return preferred;
};

const buildStorageKey = ({ clinicId, patientId, externalDocumentId, role, fileName }) => {
  const safeFileName = sanitizeFileName(fileName);
  const ext = path.extname(safeFileName) || '.bin';
  return path.join(
    sanitizeSegment(clinicId, 'clinic'),
    sanitizeSegment(patientId, 'patient'),
    `${sanitizeSegment(externalDocumentId, 'document')}--${sanitizeSegment(role, 'primary')}${ext}`
  );
};

const resolveAbsolutePath = (storageKey) => path.join(getStorageRoot(), storageKey);

const storeDocumentAsset = async ({
  clinicId,
  patientId,
  externalDocumentId,
  role = 'primary',
  buffer,
  fileName = '',
  contentType = 'application/octet-stream',
} = {}) => {
  const resolvedRole = resolveRole(role);
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Document file buffer is required.');
  }

  const context = await ensurePatientDocumentContext({ clinicId, patientId, externalDocumentId });
  const resolvedFileName = sanitizeFileName(fileName || resolveFallbackFileName(context.document, resolvedRole));
  const storageKey = buildStorageKey({
    clinicId: context.clinicId,
    patientId: context.patientId,
    externalDocumentId: context.externalDocumentId,
    role: resolvedRole,
    fileName: resolvedFileName,
  });
  const absolutePath = resolveAbsolutePath(storageKey);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, buffer);

  const metadata = getDocumentMetadata(context.document);
  const assets = metadata.assets && typeof metadata.assets === 'object' ? { ...metadata.assets } : {};
  assets[resolvedRole] = {
    storageBackend: 'server_fs',
    storageKey,
    fileName: resolvedFileName,
    contentType: String(contentType || 'application/octet-stream').trim() || 'application/octet-stream',
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
  };

  await patientClinicalRepository.updateDocument({
    id: context.document.id,
    clinicId: context.clinicId,
    patientId: context.patientId,
    data: {
      metadata: {
        ...metadata,
        assets,
      },
    },
  });

  return {
    role: resolvedRole,
    fileName: resolvedFileName,
    size: buffer.length,
    contentType: assets[resolvedRole].contentType,
    storageKey,
  };
};

const getDocumentAsset = async ({
  clinicId,
  patientId,
  externalDocumentId,
  role = 'primary',
} = {}) => {
  const resolvedRole = resolveRole(role);
  const context = await ensurePatientDocumentContext({ clinicId, patientId, externalDocumentId });
  const metadata = getDocumentMetadata(context.document);
  const assets = metadata.assets && typeof metadata.assets === 'object' ? metadata.assets : {};
  const configuredAsset = assets[resolvedRole] && typeof assets[resolvedRole] === 'object'
    ? assets[resolvedRole]
    : null;
  const fallbackFileName = resolveFallbackFileName(context.document, resolvedRole);
  const storageKey = String(configuredAsset?.storageKey || '').trim() || buildStorageKey({
    clinicId: context.clinicId,
    patientId: context.patientId,
    externalDocumentId: context.externalDocumentId,
    role: resolvedRole,
    fileName: fallbackFileName,
  });
  const absolutePath = resolveAbsolutePath(storageKey);
  if (!fs.existsSync(absolutePath)) {
    throw new AppError(404, 'DOCUMENT_FILE_NOT_FOUND', 'Stored document file not found.');
  }

  const buffer = await fs.promises.readFile(absolutePath);
  return {
    role: resolvedRole,
    fileName: sanitizeFileName(configuredAsset?.fileName || fallbackFileName),
    contentType: String(configuredAsset?.contentType || 'application/octet-stream').trim() || 'application/octet-stream',
    buffer,
    size: buffer.length,
    storageKey,
  };
};

module.exports = {
  patientDocumentStorageService: {
    storeDocumentAsset,
    getDocumentAsset,
  },
};
