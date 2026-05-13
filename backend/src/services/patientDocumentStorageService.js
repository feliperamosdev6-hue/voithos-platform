const fs = require('fs');
const path = require('path');
const { appEnv } = require('../config/appEnv');
const { AppError } = require('../errors/AppError');
const { patientRepository } = require('../repositories/patientRepository');
const { patientClinicalRepository } = require('../repositories/patientClinicalRepository');

const VALID_ROLES = new Set(['primary', 'source']);
const ONE_MB = 1024 * 1024;
const DOCUMENT_ATTACHMENT_MAX_BYTES = 5 * ONE_MB;
const PROFILE_PHOTO_MAX_BYTES = ONE_MB;
const DOCUMENT_ATTACHMENT_MIME_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
]);
const PROFILE_PHOTO_MIME_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);
const DOCUMENT_ATTACHMENT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const PROFILE_PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ATTACHMENT_DOCUMENT_TYPES = new Set(['ARQUIVO', 'ANEXO', 'IMAGEM']);
const ATTACHMENT_DOCUMENT_CATEGORIES = new Set([
  'ARQUIVO_PACIENTE',
  'ARQUIVOS',
  'ANEXO',
  'ANEXOS',
  'EXAMES',
  'IDENTIDADE',
  'IMAGEM',
  'IMAGENS',
  'OUTROS',
]);

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

const resolveAbsolutePath = (storageKey) => {
  const root = getStorageRoot();
  const absolutePath = path.resolve(root, String(storageKey || '').trim());
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolutePath !== root && !absolutePath.startsWith(rootWithSep)) {
    throw new AppError(400, 'INVALID_STORAGE_KEY', 'Invalid storage key.');
  }
  return absolutePath;
};

const normalizeStorageKeyForCompare = (storageKey = '') =>
  String(storageKey || '').trim().replace(/\\/g, '/');

const isStorageKeyForPatient = ({ storageKey, clinicId, patientId }) => {
  const normalizedKey = normalizeStorageKeyForCompare(storageKey);
  const expectedPrefix = `${sanitizeSegment(clinicId, 'clinic')}/${sanitizeSegment(patientId, 'patient')}/`;
  return Boolean(normalizedKey && normalizedKey.startsWith(expectedPrefix));
};

const assertStorageKeyForPatient = ({ storageKey, clinicId, patientId }) => {
  if (!isStorageKeyForPatient({ storageKey, clinicId, patientId })) {
    throw new AppError(400, 'INVALID_STORAGE_KEY', 'Invalid storage key for this patient.');
  }
};

const normalizeContentType = (contentType = '') => {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
};

const normalizeExtension = (extension = '') => {
  const ext = String(extension || '').trim().toLowerCase();
  if (!ext) return '';
  return ext.startsWith('.') ? ext : `.${ext}`;
};

const detectContentTypeFromBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return '';
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4E
    && buffer[3] === 0x47
    && buffer[4] === 0x0D
    && buffer[5] === 0x0A
    && buffer[6] === 0x1A
    && buffer[7] === 0x0A
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  return '';
};

const isExtensionAllowedForMime = ({ extension, mime, allowedMimeTypes }) => {
  const canonicalExtension = allowedMimeTypes.get(mime) || '';
  if (!extension || !canonicalExtension) return false;
  if (extension === canonicalExtension) return true;
  return mime === 'image/jpeg' && extension === '.jpeg' && canonicalExtension === '.jpg';
};

const resolveAllowedFileType = ({ fileName = '', contentType = '', buffer, allowedMimeTypes, allowedExtensions }) => {
  const declaredMime = normalizeContentType(contentType);
  const detectedMime = detectContentTypeFromBuffer(buffer);
  if (!detectedMime || !allowedMimeTypes.has(detectedMime)) return null;
  if (declaredMime && declaredMime !== 'application/octet-stream' && declaredMime !== detectedMime) return null;
  const extensionFromName = normalizeExtension(path.extname(sanitizeFileName(fileName, '')));
  if (extensionFromName) {
    if (!allowedExtensions.has(extensionFromName)) return null;
    if (!isExtensionAllowedForMime({ extension: extensionFromName, mime: detectedMime, allowedMimeTypes })) {
      return null;
    }
  }
  return {
    extension: allowedMimeTypes.get(detectedMime),
    contentType: detectedMime,
  };
};

const assertAllowedUploadedFile = ({
  buffer,
  byteLength,
  fileName,
  contentType,
  maxBytes,
  allowedMimeTypes,
  allowedExtensions,
  tooLargeMessage,
  invalidTypeMessage,
}) => {
  if (byteLength > maxBytes) {
    throw new AppError(413, 'FILE_TOO_LARGE', tooLargeMessage);
  }
  const fileType = resolveAllowedFileType({
    fileName,
    contentType,
    buffer,
    allowedMimeTypes,
    allowedExtensions,
  });
  if (!fileType) {
    throw new AppError(400, 'UNSUPPORTED_FILE_TYPE', invalidTypeMessage);
  }
  return fileType;
};

const isMimeLikeType = (value) => /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(value || '').trim());

const isAttachmentDocument = (document = {}) => {
  const type = String(document?.type || '').trim().toUpperCase();
  const category = String(document?.category || '').trim().toUpperCase();
  if (ATTACHMENT_DOCUMENT_TYPES.has(type)) return true;
  if (ATTACHMENT_DOCUMENT_CATEGORIES.has(category)) return true;
  return isMimeLikeType(document?.type || '');
};

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
  const isPatientAttachment = resolvedRole === 'primary' && isAttachmentDocument(context.document);
  const uploadValidation = isPatientAttachment
    ? assertAllowedUploadedFile({
        byteLength: buffer.length,
        buffer,
        fileName: resolvedFileName,
        contentType,
        maxBytes: DOCUMENT_ATTACHMENT_MAX_BYTES,
        allowedMimeTypes: DOCUMENT_ATTACHMENT_MIME_TYPES,
        allowedExtensions: DOCUMENT_ATTACHMENT_EXTENSIONS,
        tooLargeMessage: 'Arquivo muito grande. Limite: 5 MB.',
        invalidTypeMessage: 'Formato nao permitido.',
      })
    : {
        extension: normalizeExtension(path.extname(resolvedFileName)) || '.bin',
        contentType: normalizeContentType(contentType) || 'application/octet-stream',
      };
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
    contentType: uploadValidation.contentType,
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
  };

  await patientClinicalRepository.updateDocument({
    id: context.document.id,
    clinicId: context.clinicId,
    patientId: context.patientId,
    data: {
      originalName: context.document.originalName || resolvedFileName,
      storedName: context.document.storedName || resolvedFileName,
      extension: context.document.extension || uploadValidation.extension,
      size: buffer.length,
      metadata: {
        ...metadata,
        originalName: metadata.originalName || context.document.originalName || resolvedFileName,
        storedName: metadata.storedName || context.document.storedName || resolvedFileName,
        extension: metadata.extension || context.document.extension || uploadValidation.extension,
        size: buffer.length,
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
  assertStorageKeyForPatient({
    storageKey,
    clinicId: context.clinicId,
    patientId: context.patientId,
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

const removeStoredFile = async (storageKey = '') => {
  if (!storageKey) return;
  const absolutePath = resolveAbsolutePath(storageKey);
  await fs.promises.unlink(absolutePath).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
};

const storePatientProfilePhoto = async ({
  clinicId,
  patientId,
  buffer,
  fileName = '',
  contentType = '',
  previousStorageKey = '',
} = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  const normalizedPatientId = String(patientId || '').trim();
  if (!normalizedClinicId || !normalizedPatientId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and patientId are required.');
  }
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Profile photo buffer is required.');
  }
  const patient = await patientRepository.findByIdAndClinic(normalizedPatientId, normalizedClinicId);
  if (!patient) {
    throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found for this clinic.');
  }

  const safeFileName = sanitizeFileName(fileName || 'profile-photo');
  const validation = assertAllowedUploadedFile({
    byteLength: buffer.length,
    buffer,
    fileName: safeFileName,
    contentType,
    maxBytes: PROFILE_PHOTO_MAX_BYTES,
    allowedMimeTypes: PROFILE_PHOTO_MIME_TYPES,
    allowedExtensions: PROFILE_PHOTO_EXTENSIONS,
    tooLargeMessage: 'Arquivo muito grande. Limite: 1 MB.',
    invalidTypeMessage: 'Formato nao permitido.',
  });
  const storedName = `profile-photo${validation.extension === '.jpeg' ? '.jpg' : validation.extension}`;
  const storageKey = path.join(
    sanitizeSegment(normalizedClinicId, 'clinic'),
    sanitizeSegment(normalizedPatientId, 'patient'),
    storedName
  );
  const absolutePath = resolveAbsolutePath(storageKey);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, buffer);

  if (
    previousStorageKey
    && previousStorageKey !== storageKey
    && isStorageKeyForPatient({
      storageKey: previousStorageKey,
      clinicId: normalizedClinicId,
      patientId: normalizedPatientId,
    })
  ) {
    await removeStoredFile(previousStorageKey);
  }

  return {
    storageBackend: 'server_fs',
    storageKey,
    fileName: safeFileName,
    storedName,
    contentType: validation.contentType,
    extension: validation.extension,
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
  };
};

const getPatientProfilePhoto = async ({
  clinicId,
  patientId,
  storageKey,
  fileName = '',
  contentType = '',
} = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  const normalizedPatientId = String(patientId || '').trim();
  const normalizedStorageKey = String(storageKey || '').trim();
  if (!normalizedClinicId || !normalizedPatientId || !normalizedStorageKey) {
    throw new AppError(404, 'PROFILE_PHOTO_NOT_FOUND', 'Profile photo not found.');
  }
  const patient = await patientRepository.findByIdAndClinic(normalizedPatientId, normalizedClinicId);
  if (!patient) {
    throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found for this clinic.');
  }

  assertStorageKeyForPatient({
    storageKey: normalizedStorageKey,
    clinicId: normalizedClinicId,
    patientId: normalizedPatientId,
  });
  const absolutePath = resolveAbsolutePath(normalizedStorageKey);
  if (!fs.existsSync(absolutePath)) {
    throw new AppError(404, 'PROFILE_PHOTO_NOT_FOUND', 'Profile photo not found.');
  }
  const buffer = await fs.promises.readFile(absolutePath);
  return {
    buffer,
    fileName: sanitizeFileName(fileName || path.basename(normalizedStorageKey)),
    contentType: normalizeContentType(contentType) || 'application/octet-stream',
    size: buffer.length,
  };
};

module.exports = {
  patientDocumentStorageService: {
    storeDocumentAsset,
    getDocumentAsset,
    storePatientProfilePhoto,
    getPatientProfilePhoto,
    DOCUMENT_ATTACHMENT_MAX_BYTES,
    PROFILE_PHOTO_MAX_BYTES,
  },
};
