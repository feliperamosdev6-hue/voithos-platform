const path = require('path');

const createDocumentsService = ({
  patientsPath,
  documentsPath,
  receiptsPath,
  servicesPath,
  pathExists,
  ensureDir,
  readJsonFile,
  writeJsonFile,
  fsPromises,
  getCurrentUser,
}) => {
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const allowedDocumentExtensions = new Set([
    '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic',
    '.doc', '.docx', '.txt', '.rtf', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.stl', '.dcm',
  ]);
  const maxDocumentSizeBytes = 25 * 1024 * 1024;

  const generateDocumentId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const sanitizeDocumentValue = (value, maxLen = 120) => {
    if (!value) return '';
    return String(value).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
  };

  const normalizeDocumentDate = (value) => {
    const textValue = String(value || '').trim();
    if (!textValue) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(textValue);
    if (!match) return '';
    return `${match[1]}-${match[2]}-${match[3]}`;
  };

  const ensurePatientAccess = async (prontuario) => {
    const filePath = path.join(patientsPath, `${prontuario}.json`);
    if (!(await pathExists(filePath))) throw new Error('Paciente nao encontrado.');
    const patient = await readJsonFile(filePath);
    const currentUser = getCurrentUser();
    const currentClinicId = String(currentUser?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    const patientClinicId = String(patient?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    if (patientClinicId !== currentClinicId) {
      throw new Error('Acesso negado. Paciente de outra clinica.');
    }
    if (currentUser?.tipo === 'dentista') {
      if (!patient.dentistaId) throw new Error('Paciente sem dentista atribuido.');
      if (patient.dentistaId !== currentUser.id) throw new Error('Acesso negado.');
    }
    return patient;
  };

  const ensurePatientDocumentsDir = async (prontuario) => {
    const baseDir = path.join(documentsPath, prontuario);
    const filesDir = path.join(baseDir, 'files');
    await ensureDir(filesDir);
    const indexPath = path.join(baseDir, 'index.json');
    if (!(await pathExists(indexPath))) {
      await writeJsonFile(indexPath, { documents: [] });
    }
    return { baseDir, filesDir, indexPath };
  };

  const readPatientDocumentsIndex = async (prontuario) => {
    const { indexPath } = await ensurePatientDocumentsDir(prontuario);
    const data = await readJsonFile(indexPath);
    return Array.isArray(data.documents) ? data.documents : [];
  };

  const writePatientDocumentsIndex = async (prontuario, documents) => {
    const { indexPath } = await ensurePatientDocumentsDir(prontuario);
    await writeJsonFile(indexPath, { documents });
  };

  const getPatientDocumentCount = async (prontuario) => {
    try {
      const docs = await readPatientDocumentsIndex(prontuario);
      return docs.filter((doc) => !doc.archived).length;
    } catch (err) {
      return 0;
    }
  };

  const readDirectoryFiles = async (folderPath) => {
    if (!(await pathExists(folderPath))) return [];
    const files = await fsPromises.readdir(folderPath);
    return files.map((file) => ({
      name: file,
      path: path.join(folderPath, file),
    }));
  };

  const readPatientFilesDetailed = async () => {
    if (!(await pathExists(patientsPath))) return [];

    const receiptFiles = await readDirectoryFiles(receiptsPath);
    const serviceFiles = await readDirectoryFiles(servicesPath);
    const files = await fsPromises.readdir(patientsPath);
    const result = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(patientsPath, file);
      try {
        const patient = await readJsonFile(filePath);
        const prontuario = patient.prontuario || path.basename(file, '.json');
        const servicos = Array.isArray(patient.servicos) ? patient.servicos : [];
        const documentCount = await getPatientDocumentCount(prontuario);

        const patientReceipts = (receiptFiles || []).filter((r) =>
          r.name.includes(prontuario)
        );
        const patientServiceFiles = (serviceFiles || []).filter((s) =>
          s.name.includes(prontuario)
        );

        result.push({
          nome: patient.fullName || patient.nome || '',
          cpf: patient.cpf || '',
          telefone: patient.telefone || patient.phone || patient.celular || patient.whatsapp || '',
          prontuario,
          procedimentos: servicos.length,
          documentos: patientReceipts.length,
          serviceCount: servicos.length,
          documentCount,
          receipts: patientReceipts,
          serviceFiles: patientServiceFiles,
          filePath,
        });
      } catch (err) {
        console.error(`Erro ao ler paciente ${file}:`, err);
      }
    }

    return result;
  };

  return {
    allowedDocumentExtensions,
    maxDocumentSizeBytes,
    generateDocumentId,
    sanitizeDocumentValue,
    normalizeDocumentDate,
    ensurePatientAccess,
    ensurePatientDocumentsDir,
    readPatientDocumentsIndex,
    writePatientDocumentsIndex,
    getPatientDocumentCount,
    readDirectoryFiles,
    readPatientFilesDetailed,
  };
};

module.exports = { createDocumentsService };
