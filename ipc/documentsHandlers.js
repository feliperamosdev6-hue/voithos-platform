const path = require('path');

const registerDocumentsHandlers = ({
  ipcMain,
  shell,
  pathExists,
  fsPromises,
  fsConstants,
  readJsonFile,
  writeJsonFile,
  ensurePatientAccess,
  sanitizeDocumentValue,
  normalizeDocumentDate,
  ensurePatientDocumentsDir,
  readPatientDocumentsIndex,
  writePatientDocumentsIndex,
  getPatientDocumentCount,
  readDirectoryFiles,
  readPatientFilesDetailed,
  allowedDocumentExtensions,
  maxDocumentSizeBytes,
  generateDocumentId,
  generateAnamnesePdf,
  generateAtestadoPdf,
  generateReceitaPdf,
  generateContratoPdf,
  generateOrcamentoPdf,
  generateDossiePdf,
  generateTestPdf,
  currentUserRef,
  centralBackendAdapter,
  requireRole,
  patientsPath,
  receiptsPath,
  servicesPath,
  userDataPath,
}) => {
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const getCurrentClinicId = () => String(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const normalizeDocType = (value) => String(value || '').trim().toUpperCase();
  const isCentralEnabled = () => centralBackendAdapter?.isEnabled?.() === true;
  const shouldFallbackToLocal = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    const status = Number(error?.status || 0);
    return code === 'CENTRAL_BACKEND_UNAVAILABLE'
      || code === 'CENTRAL_BACKEND_TIMEOUT'
      || error?.name === 'AbortError'
      || status >= 500;
  };
  let centralLogged = false;
  const logCentralActive = () => {
    if (centralLogged) return;
    centralLogged = true;
    console.info('[PRONTUARIO] documents central backend active');
  };
  const logDocumentFallback = (action, error, extra = {}) => {
    console.warn('[PRONTUARIO] documents fallback to local', JSON.stringify({
      action,
      module: 'documents',
      operation: action,
      clinical_fallback_to_local: true,
      clinicId: getCurrentClinicId(),
      fallback_triggered: true,
      fallback_reason: error?.message || String(error || ''),
      reason: error?.message || String(error || ''),
      ...extra,
    }));
  };
  const sortDocuments = (items = []) => items.sort((a, b) => {
      const aDate = String(a?.documentDate || a?.createdAt || '');
      const bDate = String(b?.documentDate || b?.createdAt || '');
      return bDate.localeCompare(aDate);
    });
  const mergeDocumentMirror = (current = [], incoming = []) => {
    const map = new Map();
    (Array.isArray(current) ? current : []).forEach((item) => {
      const key = String(item?.id || '').trim();
      if (!key) return;
      map.set(key, { ...item });
    });
    (Array.isArray(incoming) ? incoming : []).forEach((item) => {
      const key = String(item?.id || '').trim();
      if (!key) return;
      const merged = {
        ...(map.get(key) || {}),
        ...item,
      };
      delete merged.source;
      map.set(key, merged);
    });
    return Array.from(map.values());
  };
  const mirrorDocumentsToLocal = async (prontuario, incoming = []) => {
    const localDocs = await readPatientDocumentsIndex(prontuario).catch(() => []);
    const merged = mergeDocumentMirror(localDocs, incoming);
    await writePatientDocumentsIndex(prontuario, merged);
    return merged;
  };
  const loadDocumentsFromSource = async ({ prontuario, patient, includeArchived = false } = {}) => {
    const localDocs = await readPatientDocumentsIndex(prontuario);
    const localFiltered = includeArchived ? localDocs : localDocs.filter((doc) => !doc.archived);
    if (!isCentralEnabled()) {
      return {
        source: 'local',
        documents: sortDocuments(localFiltered),
      };
    }

    try {
      logCentralActive();
      const centralDocs = await centralBackendAdapter.listPatientDocuments({
        clinicId: getCurrentClinicId(),
        patient: { ...patient, clinicId: getCurrentClinicId() },
        includeArchived,
      });
      console.info('[PRONTUARIO] clinical_loaded_from=central', JSON.stringify({
        clinicId: getCurrentClinicId(),
        patientId: patient?.id || patient?.prontuario || '',
        dataType: 'document',
        source: 'central',
        count: centralDocs.length,
      }));
      await mirrorDocumentsToLocal(prontuario, centralDocs || []).catch(() => null);
      return {
        source: 'central',
        documents: sortDocuments((centralDocs || []).map((item) => ({ ...item, source: 'central' }))),
      };
    } catch (error) {
      if (!shouldFallbackToLocal(error)) throw error;
      logDocumentFallback('load-documents', error, { prontuario });
      return {
        source: 'local',
        documents: sortDocuments(localFiltered),
      };
    }
  };
  const readMutableDocuments = async ({ prontuario, patient, includeArchived = true } = {}) => {
    const sourceData = await loadDocumentsFromSource({ prontuario, patient, includeArchived });
    return Array.isArray(sourceData?.documents)
      ? sourceData.documents.map((item) => {
        const copy = { ...item };
        delete copy.source;
        return copy;
      })
      : [];
  };
  const syncDocumentFilesToCentral = async ({ patient, prontuario, record }) => {
    if (!isCentralEnabled()) return null;
    const clinicId = getCurrentClinicId();
    const localPatient = patient || await ensurePatientAccess(prontuario);
    const { filesDir } = await ensurePatientDocumentsDir(prontuario);
    const primaryName = String(record?.storedName || record?.originalName || '').trim();
    if (primaryName) {
      const primaryPath = path.join(filesDir, primaryName);
      if (await pathExists(primaryPath)) {
        await centralBackendAdapter.uploadPatientDocumentFile({
          clinicId,
          patient: {
            ...localPatient,
            clinicId,
          },
          documentId: String(record?.id || '').trim(),
          filePath: primaryPath,
          role: 'primary',
          fileName: primaryName,
        });
      }
    }
    const sourceJsonName = String(record?.sourceJsonName || '').trim();
    if (sourceJsonName) {
      const sourcePath = path.join(filesDir, sourceJsonName);
      if (await pathExists(sourcePath)) {
        await centralBackendAdapter.uploadPatientDocumentFile({
          clinicId,
          patient: {
            ...localPatient,
            clinicId,
          },
          documentId: String(record?.id || '').trim(),
          filePath: sourcePath,
          role: 'source',
          fileName: sourceJsonName,
        });
      }
    }
    return true;
  };
  const syncDocumentMetadataToCentral = async ({ patient, prontuario, record, action, uploadFiles = false }) => {
    if (!isCentralEnabled()) return null;
    logCentralActive();
    const clinicId = getCurrentClinicId();
    const localPatient = patient || await ensurePatientAccess(prontuario);
    const { filesDir } = await ensurePatientDocumentsDir(prontuario);
    const result = await centralBackendAdapter.upsertPatientDocumentMetadata({
      clinicId,
      patient: {
        ...localPatient,
        clinicId,
      },
      document: {
        ...record,
        localPath: path.join(filesDir, record.storedName || record.originalName || ''),
        metadata: record?.data || undefined,
      },
    });
    console.info('[PRONTUARIO] document metadata write central', JSON.stringify({
      action,
      clinicId,
      patientId: localPatient?.id || localPatient?.prontuario || '',
      documentId: record?.id || '',
    }));
    if (uploadFiles) {
      await syncDocumentFilesToCentral({
        patient: localPatient,
        prontuario,
        record,
      });
    }
    return result;
  };
  const ensureLocalDocumentAsset = async ({ patient, prontuario, record, role = 'primary' }) => {
    const { filesDir } = await ensurePatientDocumentsDir(prontuario);
    const fileName = String(
      role === 'source'
        ? (record?.sourceJsonName || '')
        : (record?.storedName || record?.originalName || '')
    ).trim();
    if (!fileName) throw new Error('Arquivo nao encontrado.');

    const targetPath = path.join(filesDir, fileName);
    if (await pathExists(targetPath)) return targetPath;
    if (!isCentralEnabled()) throw new Error('Arquivo nao encontrado.');

    logCentralActive();
    const localPatient = patient || await ensurePatientAccess(prontuario);
    const download = await centralBackendAdapter.downloadPatientDocumentFile({
      clinicId: getCurrentClinicId(),
      patient: {
        ...localPatient,
        clinicId: getCurrentClinicId(),
      },
      documentId: String(record?.id || '').trim(),
      role,
    });
    await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
    await fsPromises.writeFile(targetPath, download.buffer);
    return targetPath;
  };

  const resolveDentistaId = (patient) => {
    const user = currentUserRef?.() || {};
    if (user.tipo === 'dentista' && user.id) return String(user.id);
    return String(patient?.dentistaId || user.id || '');
  };

  const validatePatientBinding = ({ patientId, patient, prontuario }) => {
    const incoming = sanitizeDocumentValue(patientId, 120);
    if (!incoming) return '';
    const candidates = [
      patient?.id,
      patient?._id,
      patient?.prontuario,
      prontuario,
    ]
      .filter(Boolean)
      .map((value) => String(value));
    if (!candidates.includes(String(incoming))) {
      throw new Error('Paciente informado nao corresponde ao prontuario selecionado.');
    }
    return incoming;
  };

  ipcMain.handle('read-patient-files', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    try {
      const isDentista = currentUserRef()?.tipo === 'dentista';

      const files = await fsPromises.readdir(patientsPath);
      const results = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const fullPath = path.join(patientsPath, file);
        const patient = await readJsonFile(fullPath);
        if (String(patient?.clinicId || DEFAULT_CLINIC_ID) !== getCurrentClinicId()) continue;

        if (isDentista && patient.dentistaId !== currentUserRef()?.id) continue;

        const nome = patient.fullName || patient.nome || 'Paciente sem nome';
        const cpf = patient.cpf || 'Nao informado';
        const telefone = patient.telefone || patient.phone || patient.celular || patient.whatsapp || '';
        const prontuario = patient.prontuario || '----';

        const procedimentos = Array.isArray(patient.servicos)
          ? patient.servicos.length
          : 0;

        const documentCount = await getPatientDocumentCount(prontuario);

        const allReceipts = await fsPromises.readdir(receiptsPath);
        const documentos = allReceipts.filter((r) => r.includes(prontuario)).length;

        results.push({
          nome,
          cpf,
          telefone,
          prontuario,
          procedimentos,
          documentos,
          documentCount,
        });
      }

      return results;
    } catch (err) {
      console.error('Erro ao ler pacientes:', err);
      return [];
    }
  });

  ipcMain.handle('read-patient-documents', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
    if (!prontuario) throw new Error('Prontuario obrigatorio.');
    const patient = await ensurePatientAccess(prontuario);
    const includeArchived = Boolean(payload.includeArchived);
    const sourceData = await loadDocumentsFromSource({ prontuario, patient, includeArchived });
    return sourceData.documents;
  });

  ipcMain.handle('upload-patient-document', async (_event, payload = {}) => {
    try {
      requireRole(['admin', 'recepcionista', 'dentista']);
      const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
      if (!prontuario) throw new Error('Prontuario obrigatorio.');
      const patient = await ensurePatientAccess(prontuario);
      validatePatientBinding({ patientId: payload.pacienteId, patient, prontuario });

      const category = sanitizeDocumentValue(payload.category, 80);
      const type = sanitizeDocumentValue(payload.type, 120);
      if (!category || !type) throw new Error('Categoria e tipo obrigatorios.');

      const filePath = String(payload.filePath || '').trim();
      if (!filePath) throw new Error('Arquivo obrigatorio.');
      if (!(await pathExists(filePath))) throw new Error('Arquivo nao encontrado.');

      const stat = await fsPromises.stat(filePath);
      if (!stat.isFile()) throw new Error('Arquivo invalido.');
      if (stat.size > maxDocumentSizeBytes) throw new Error('Arquivo muito grande. Limite: 5 MB.');

      const ext = path.extname(filePath).toLowerCase();
      if (!allowedDocumentExtensions.has(ext)) throw new Error('Tipo de arquivo nao permitido.');

      const { filesDir } = await ensurePatientDocumentsDir(prontuario);
      const documentId = generateDocumentId();
      const storedName = `${documentId}${ext}`;
      const targetPath = path.join(filesDir, storedName);
      await fsPromises.copyFile(filePath, targetPath, fsConstants.COPYFILE_EXCL);

      const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
      const now = new Date();
      const requestedType = sanitizeDocumentValue(payload.type, 40).toUpperCase();
      const finalType = requestedType === 'ORCAMENTO' ? 'ORCAMENTO' : 'CUSTOMIZAVEL';
      let versionOf = documentId;
      let version = 1;

      const requestedVersionOf = sanitizeDocumentValue(payload.versionOf, 80);
      if (requestedVersionOf) {
        const base = documents.find((doc) => doc.id === requestedVersionOf || doc.versionOf === requestedVersionOf);
        if (!base) throw new Error('Documento base nao encontrado.');
        versionOf = base.versionOf || base.id;
        const siblings = documents.filter((doc) => doc.versionOf === versionOf);
        version = siblings.reduce((max, doc) => Math.max(max, Number(doc.version) || 1), 1) + 1;
        documents.forEach((doc) => {
          if (doc.versionOf === versionOf) doc.isLatest = false;
        });
      }

      const record = {
        id: documentId,
        prontuario,
        category,
        categoria: category,
        type,
        title: sanitizeDocumentValue(payload.title, 120),
        titulo: sanitizeDocumentValue(payload.title, 120),
        folder: sanitizeDocumentValue(payload.folder, 120),
        notes: sanitizeDocumentValue(payload.notes, 500),
        atendimentoId: sanitizeDocumentValue(payload.atendimentoId, 80),
        documentDate: normalizeDocumentDate(payload.documentDate),
        createdAt: now.toISOString(),
        createdBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        dentistaId: resolveDentistaId(patient),
        originalName: path.basename(filePath),
        storedName,
        size: stat.size,
        extension: ext,
        versionOf,
        version,
        isLatest: true,
        archived: false,
      };

      documents.push(record);
      await writePatientDocumentsIndex(prontuario, documents);
      try {
        await syncDocumentMetadataToCentral({
          patient,
          prontuario,
          record,
          action: 'upload-patient-document',
          uploadFiles: true,
        });
      } catch (error) {
        logDocumentFallback('upload-patient-document', error, { prontuario, documentId: record.id });
      }
      return record;
    } catch (err) {
      console.error('[DOCUMENTS] upload-patient-document', err);
      throw err;
    }
  });

  ipcMain.handle('generate-patient-dossie', async (_event, payload = {}) => {
    try {
      requireRole(['admin', 'dentista']);
      const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
      if (!prontuario) throw new Error('Prontuario obrigatorio.');
      const patient = await ensurePatientAccess(prontuario);

      const docsInput = Array.isArray(payload.docs) ? payload.docs : null;
      const docsRaw = docsInput || (await loadDocumentsFromSource({ prontuario, patient, includeArchived: false })).documents;
      const docs = docsRaw.filter((doc) => !doc.archived);
      const now = new Date();

      const parseDateIso = (doc) => {
        const value = String(doc.documentDate || doc.createdAt || '').trim();
        if (!value) return '';
        if (value.includes('T')) return value;
        return `${value}T00:00:00.000Z`;
      };

      const buildResumo = (doc) => {
        const d = doc?.data || {};
        const type = String(doc?.type || '').toUpperCase();
        if (type === 'RECEITA') {
          const itens = Array.isArray(d.itens) ? d.itens.length : 0;
          return itens ? `${itens} item(ns) prescrito(s)` : (d.texto || 'Receita emitida');
        }
        if (type === 'ATESTADO') {
          if (String(d.tipo || '').toLowerCase() === 'horas') return `Afastamento de ${d.horaInicio || '--:--'} a ${d.horaFim || '--:--'}`;
          return `Afastamento por ${d.dias || 0} dia(s)`;
        }
        if (type === 'EVOLUCAO') return d.texto || 'Evolucao clinica registrada';
        if (type === 'CONTRATO') return d.modelo || 'Contrato registrado';
        if (type === 'CUSTOMIZAVEL') return d.conteudo || 'Documento customizavel';
        return doc.notes || doc.originalName || 'Documento registrado';
      };

      const toBrDateTime = (value) => {
        if (!value) return '-';
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return value;
        return dt.toLocaleString('pt-BR');
      };

      const timeline = docs
        .map((doc) => ({
          tipo: doc.type || doc.category || 'Documento',
          titulo: doc.title || doc.titulo || doc.originalName || 'Documento',
          dataHora: toBrDateTime(parseDateIso(doc) || doc.createdAt || ''),
          profissional: doc.createdBy?.nome || doc.data?.profissionalNome || '-',
          resumo: buildResumo(doc),
          _sortKey: parseDateIso(doc) || doc.createdAt || '',
        }))
        .sort((a, b) => String(a._sortKey || '').localeCompare(String(b._sortKey || '')))
        .map(({ _sortKey, ...rest }) => rest);

      const anexados = docs
        .filter((doc) => String(doc.extension || '').toLowerCase() !== '.json')
        .map((doc) => ({
          nome: doc.originalName || doc.storedName || doc.title || doc.titulo || 'Arquivo',
          tipo: String(doc.extension || path.extname(doc.originalName || '') || '').replace('.', '').toUpperCase() || 'ARQUIVO',
          dataUpload: toBrDateTime(doc.createdAt || doc.documentDate || ''),
        }));

      const consultas = Array.isArray(patient?.consultas) ? patient.consultas : [];
      const lastConsulta = consultas
        .map((c) => {
          const date = String(c.data || '').trim();
          const time = String(c.horaInicio || '00:00').trim();
          return date ? `${date}T${time}:00` : '';
        })
        .filter(Boolean)
        .sort()
        .at(-1) || '';

      const totalReceitas = docs.filter((d) => String(d.type || '').toUpperCase() === 'RECEITA').length;
      const totalAtestados = docs.filter((d) => String(d.type || '').toUpperCase() === 'ATESTADO').length;

      const consolidated = {
        identificacao: {
          nomeCompleto: patient.fullName || patient.nome || '',
          cpf: patient.cpf || '',
          telefone: patient.telefone || patient.phone || patient.celular || patient.whatsapp || '',
          prontuario: patient.prontuario || prontuario,
          dataGeracao: toBrDateTime(now.toISOString()),
        },
        resumo: {
          statusAnamnese: patient.temAnamnese ? 'Anamnese registrada' : 'Sem anamnese registrada',
          ultimoAtendimento: lastConsulta ? toBrDateTime(lastConsulta) : '-',
          totalDocumentos: docs.length,
          totalReceitas,
          totalAtestados,
          totalArquivosAnexados: anexados.length,
        },
        timeline,
        arquivos: anexados,
        assinatura: {
          profissionalNome: currentUserRef()?.nome || '-',
          dataHoraEmissao: toBrDateTime(now.toISOString()),
          versaoSistema: sanitizeDocumentValue(payload.systemVersion, 80) || 'desconhecida',
        },
      };

      const { filesDir } = await ensurePatientDocumentsDir(prontuario);
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const pdfName = `dossie-${stamp}.pdf`;
      const pdfPath = path.join(filesDir, pdfName);
      const { hash } = await generateDossiePdf({ pdfPath, consolidated });
      const stat = await fsPromises.stat(pdfPath);

      const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
      const docId = generateDocumentId();
      const record = {
        id: docId,
        prontuario,
        category: 'clinicos',
        categoria: 'clinicos',
        type: 'DOSSIE',
        title: `Dossie completo ${now.toLocaleDateString('pt-BR')}`,
        titulo: `Dossie completo ${now.toLocaleDateString('pt-BR')}`,
        notes: `Hash SHA256: ${hash}`,
        documentDate: now.toISOString().split('T')[0],
        createdAt: now.toISOString(),
        createdBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        dentistaId: resolveDentistaId(patient),
        originalName: pdfName,
        storedName: pdfName,
        size: stat.size,
        extension: '.pdf',
        versionOf: docId,
        version: 1,
        isLatest: true,
        archived: false,
        data: {
          hash,
          consolidated,
        },
      };

      documents.push(record);
      await writePatientDocumentsIndex(prontuario, documents);
      try {
        await syncDocumentMetadataToCentral({
          patient,
          prontuario,
          record,
          action: 'generate-patient-dossie',
          uploadFiles: true,
        });
      } catch (error) {
        logDocumentFallback('generate-patient-dossie', error, { prontuario, documentId: record.id });
      }
      console.info('[DOCUMENTS] dossie gerado', {
        prontuario,
        documentId: docId,
        userId: currentUserRef()?.id || '',
      });
      return { success: true, record, hash, pdfPath };
    } catch (err) {
      console.error('[DOCUMENTS] generate-patient-dossie', err);
      throw err;
    }
  });

  ipcMain.handle('generate-test-pdf', async (_event, payload = {}) => {
    requireRole(['admin', 'dentista']);
    const fileName = sanitizeDocumentValue(payload.fileName, 120) || `teste-pdf-${Date.now()}.pdf`;
    const safeName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    const targetPath = path.join(userDataPath, 'DOCUMENTOS', safeName);
    await generateTestPdf({
      clinicId: getCurrentClinicId(),
      payload: payload.data || {},
      outputPath: targetPath,
    });
    return { pdfPath: targetPath };
  });

  ipcMain.handle('save-patient-custom-document', async (_event, payload = {}) => {
    try {
      requireRole(['admin', 'recepcionista', 'dentista']);
      const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
      if (!prontuario) throw new Error('Prontuario obrigatorio.');
      const patient = await ensurePatientAccess(prontuario);
      const pacienteId = validatePatientBinding({ patientId: payload.pacienteId, patient, prontuario });

      const conteudo = sanitizeDocumentValue(payload.conteudo, 10000);
      if (!conteudo) throw new Error('Conteudo do documento obrigatorio.');
      const now = new Date();
      const category = sanitizeDocumentValue(payload.category, 80)
        || sanitizeDocumentValue(payload.categoria, 80)
        || 'clinicos';
      const title = sanitizeDocumentValue(payload.title, 120)
        || sanitizeDocumentValue(payload.titulo, 120)
        || `Documento ${now.toLocaleDateString('pt-BR')}`;

      const { filesDir } = await ensurePatientDocumentsDir(prontuario);
      const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const fileName = `custom-${stamp}.json`;
      const targetPath = path.join(filesDir, fileName);

      const payloadToSave = {
        prontuario,
        updatedAt: now.toISOString(),
        updatedBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        data: {
          prontuario,
          pacienteId,
          pacienteNome: sanitizeDocumentValue(payload.pacienteNome, 160) || patient.fullName || patient.nome || '',
          profissionalId: sanitizeDocumentValue(payload.profissionalId, 120) || currentUserRef()?.id || '',
          profissionalNome: sanitizeDocumentValue(payload.profissionalNome, 160) || currentUserRef()?.nome || '',
          data: normalizeDocumentDate(payload.data) || now.toISOString().split('T')[0],
          titulo: title,
          conteudo,
          pasta: sanitizeDocumentValue(payload.folder, 120),
        },
      };

      await writeJsonFile(targetPath, payloadToSave);
      const stat = await fsPromises.stat(targetPath);
      const docId = generateDocumentId();
      let storedName = fileName;
      let extension = '.json';
      let size = stat.size;
      if (finalType === 'ORCAMENTO') {
        const pdfName = `orcamento-${stamp}.pdf`;
        const pdfPath = path.join(filesDir, pdfName);
        await generateOrcamentoPdf({
          jsonPath: targetPath,
          pdfPath,
          patient,
          doc: { title, type: 'ORCAMENTO' },
        });
        const pdfStat = await fsPromises.stat(pdfPath);
        storedName = pdfName;
        extension = '.pdf';
        size = pdfStat.size;
      }
      const record = {
        id: docId,
        prontuario,
        category,
        categoria: category,
        type: finalType,
        title,
        titulo: title,
        folder: payloadToSave.data.pasta || '',
        documentDate: payloadToSave.data.data,
        createdAt: now.toISOString(),
        createdBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        dentistaId: resolveDentistaId(patient),
        originalName: storedName,
        storedName,
        size,
        extension,
        sourceJsonName: fileName,
        sourceJsonSize: stat.size,
        versionOf: docId,
        version: 1,
        isLatest: true,
        archived: false,
        data: payloadToSave.data,
      };

      documents.push(record);
      await writePatientDocumentsIndex(prontuario, documents);
      try {
        await syncDocumentMetadataToCentral({
          patient,
          prontuario,
          record,
          action: 'save-patient-contrato',
          uploadFiles: true,
        });
      } catch (error) {
        logDocumentFallback('save-patient-contrato', error, { prontuario, documentId: record.id });
      }
      return record;
    } catch (err) {
      console.error('[DOCUMENTS] save-patient-custom-document', err);
      throw err;
    }
  });

  ipcMain.handle('archive-patient-document', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
    const documentId = sanitizeDocumentValue(payload.documentId, 80);
    if (!prontuario || !documentId) throw new Error('Dados obrigatorios.');
    const patient = await ensurePatientAccess(prontuario);

    const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
    const doc = documents.find((item) => item.id === documentId);
    if (!doc) throw new Error('Documento nao encontrado.');

    const archived = Boolean(payload.archived);
    doc.archived = archived;
    doc.archivedAt = archived ? new Date().toISOString() : null;
    doc.archivedBy = archived
      ? { id: currentUserRef()?.id || '', nome: currentUserRef()?.nome || '', tipo: currentUserRef()?.tipo || '' }
      : null;

    await writePatientDocumentsIndex(prontuario, documents);
    try {
      await syncDocumentMetadataToCentral({
        patient,
        prontuario,
        record: doc,
        action: 'archive-patient-document',
      });
    } catch (error) {
      logDocumentFallback('archive-patient-document', error, { prontuario, documentId });
    }

    const isAnamneseDoc = normalizeDocType(doc.type || doc.tipo) === 'ANAMNESE';
    if (isAnamneseDoc) {
      const patientPath = path.join(patientsPath, `${prontuario}.json`);
      try {
        const patientData = await readJsonFile(patientPath);
        const activeAnamneses = documents
          .filter((item) => !item.archived && normalizeDocType(item.type || item.tipo) === 'ANAMNESE')
          .sort((a, b) => String(b.createdAt || b.documentDate || '').localeCompare(String(a.createdAt || a.documentDate || '')));

        patientData.temAnamnese = activeAnamneses.length > 0;
        patientData.ultimaAnamneseEm = activeAnamneses[0]?.createdAt || activeAnamneses[0]?.documentDate || '';

        const anamneses = Array.isArray(patientData.anamneses) ? patientData.anamneses : [];
        if (archived) {
          patientData.anamneses = anamneses.filter((item) => String(item?.id || '') !== String(documentId));
        }
        await writeJsonFile(patientPath, patientData);
      } catch (err) {
        console.warn('Nao foi possivel sincronizar status da anamnese no prontuario.', err);
      }
    }

    return doc;
  });

  ipcMain.handle('open-document-file', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
    const documentId = sanitizeDocumentValue(payload.documentId, 80);
    if (!prontuario || !documentId) throw new Error('Dados obrigatorios.');
    const patient = await ensurePatientAccess(prontuario);

    const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
    const doc = documents.find((item) => item.id === documentId);
    if (!doc) throw new Error('Documento nao encontrado.');

    const { filesDir } = await ensurePatientDocumentsDir(prontuario);
    const targetPath = await ensureLocalDocumentAsset({ patient, prontuario, record: doc, role: 'primary' });

    const docType = String(doc.type || '').toUpperCase();
    const isAnamnese = docType === 'ANAMNESE';
    const isAtestado = docType === 'ATESTADO';
    const isReceita = docType === 'RECEITA';
    const isContrato = docType === 'CONTRATO';
    const isOrcamento = docType === 'ORCAMENTO' || docType === 'CUSTOMIZAVEL';
    const ext = String(doc.extension || path.extname(targetPath) || '').toLowerCase();
    if ((isAnamnese || isAtestado || isReceita || isContrato || isOrcamento) && ext === '.json') {
      const baseName = path.basename(targetPath, ext);
      const pdfPath = path.join(filesDir, `${baseName}.pdf`);
      let shouldGenerate = true;
      if (await pathExists(pdfPath)) {
        try {
          const [srcStat, pdfStat] = await Promise.all([
            fsPromises.stat(targetPath),
            fsPromises.stat(pdfPath),
          ]);
          shouldGenerate = srcStat.mtimeMs > pdfStat.mtimeMs;
        } catch (_) {
          shouldGenerate = true;
        }
      }
      if (shouldGenerate) {
        if (isAtestado) {
          await generateAtestadoPdf({ jsonPath: targetPath, pdfPath, patient, doc });
        } else if (isReceita) {
          await generateReceitaPdf({ jsonPath: targetPath, pdfPath, patient, doc });
        } else if (isContrato) {
          await generateContratoPdf({ jsonPath: targetPath, pdfPath, patient, doc });
        } else if (isOrcamento) {
          await generateOrcamentoPdf({ jsonPath: targetPath, pdfPath, patient, doc });
        } else {
          await generateAnamnesePdf({ jsonPath: targetPath, pdfPath, patient, doc });
        }
      }
      await shell.openPath(pdfPath);
      return { success: true };
    }

    await shell.openPath(targetPath);
    return { success: true };
  });

  ipcMain.handle('save-patient-anamnese', async (_event, payload = {}) => {
    try {
      requireRole(['admin', 'recepcionista', 'dentista']);
      const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
      if (!prontuario) throw new Error('Prontuario obrigatorio.');
      const patient = await ensurePatientAccess(prontuario);
      validatePatientBinding({ patientId: payload.pacienteId, patient, prontuario });

      const data = payload.data;
      if (!data || typeof data !== 'object') throw new Error('Dados invalidos.');

      const { filesDir } = await ensurePatientDocumentsDir(prontuario);
      const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const fileName = `anamnese-${stamp}.json`;
      const targetPath = path.join(filesDir, fileName);

      const payloadToSave = {
        prontuario,
        updatedAt: now.toISOString(),
        updatedBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        data,
      };

      await writeJsonFile(targetPath, payloadToSave);
      const stat = await fsPromises.stat(targetPath);

      const docId = generateDocumentId();
      let versionOf = docId;
      let version = 1;

      const existing = documents.filter((doc) => normalizeDocType(doc.type || doc.tipo) === 'ANAMNESE' && !doc.archived);
      if (existing.length) {
        const latest = existing.find((doc) => doc.isLatest)
          || existing.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
        const baseId = latest.versionOf || latest.id;
        versionOf = baseId;
        const siblings = documents.filter((doc) => doc.versionOf === baseId);
        version = siblings.reduce((max, doc) => Math.max(max, Number(doc.version) || 1), 1) + 1;
        documents.forEach((doc) => {
          if (doc.versionOf === baseId) doc.isLatest = false;
        });
      }

      const title = sanitizeDocumentValue(payload.title, 120) || `Anamnese ${now.toLocaleDateString('pt-BR')}`;
      const record = {
        id: docId,
        prontuario,
        category: 'anamnese',
        categoria: 'anamnese',
        type: 'ANAMNESE',
        title,
        titulo: title,
        notes: sanitizeDocumentValue(payload.notes, 500),
        atendimentoId: sanitizeDocumentValue(payload.atendimentoId, 80),
        documentDate: now.toISOString().split('T')[0],
        createdAt: now.toISOString(),
        createdBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        dentistaId: resolveDentistaId(patient),
        originalName: fileName,
        storedName: fileName,
        size: stat.size,
        extension: '.json',
        versionOf,
        version,
        isLatest: true,
        archived: false,
      };

      documents.push(record);
      await writePatientDocumentsIndex(prontuario, documents);

      const patientPath = path.join(patientsPath, `${prontuario}.json`);
      try {
        const patientData = await readJsonFile(patientPath);
        const anamneses = Array.isArray(patientData.anamneses) ? patientData.anamneses : [];
        anamneses.push({
          id: docId,
          data: record.documentDate,
          titulo: title,
          createdAt: now.toISOString(),
          profissionalId: currentUserRef()?.id || '',
          profissionalNome: currentUserRef()?.nome || '',
        });
        patientData.anamneses = anamneses;
        patientData.temAnamnese = true;
        patientData.ultimaAnamneseEm = now.toISOString();
        await writeJsonFile(patientPath, patientData);
      } catch (err) {
        console.warn('Nao foi possivel atualizar anamnese no prontuario.', err);
      }

      try {
        await syncDocumentMetadataToCentral({
          patient,
          prontuario,
          record,
          action: 'save-patient-anamnese:metadata',
          uploadFiles: true,
        });
        await centralBackendAdapter.createPatientAnamnesis({
          clinicId: getCurrentClinicId(),
          patient: { ...patient, clinicId: getCurrentClinicId() },
          data,
          document: record,
        });
        console.info('[PRONTUARIO] anamnesis write central', JSON.stringify({
          clinicId: getCurrentClinicId(),
          patientId: patient?.id || patient?.prontuario || '',
          documentId: record.id,
        }));
      } catch (error) {
        logDocumentFallback('save-patient-anamnese', error, { prontuario, documentId: record.id });
      }

      return record;
    } catch (err) {
      console.error('[DOCUMENTS] save-patient-anamnese', err);
      throw err;
    }
  });

  ipcMain.handle('save-patient-atestado', async (_event, payload = {}) => {
    try {
      requireRole(['admin', 'recepcionista', 'dentista']);
      const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
      if (!prontuario) throw new Error('Prontuario obrigatorio.');
      const patient = await ensurePatientAccess(prontuario);
      validatePatientBinding({ patientId: payload.pacienteId, patient, prontuario });

      const data = payload;
      if (!data || typeof data !== 'object') throw new Error('Dados invalidos.');
      const tipo = String(data.tipo || '').trim().toLowerCase();
      if (!['dias', 'horas'].includes(tipo)) throw new Error('Tipo de atestado invalido.');
      if (!data.data) throw new Error('Data obrigatoria.');
      if (!data.profissionalId) throw new Error('Profissional obrigatorio.');
      if (tipo === 'dias' && Number(data.dias || 0) < 1) throw new Error('Quantidade de dias invalida.');
      if (tipo === 'horas') {
        const start = String(data.horaInicio || '').trim();
        const end = String(data.horaFim || '').trim();
        if (!start || !end || start >= end) throw new Error('Horario invalido.');
      }

      const { filesDir } = await ensurePatientDocumentsDir(prontuario);
      const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const fileName = `atestado-${stamp}.json`;
      const targetPath = path.join(filesDir, fileName);

      const payloadToSave = {
        prontuario,
        updatedAt: now.toISOString(),
        updatedBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        data: {
          prontuario,
          pacienteId: sanitizeDocumentValue(data.pacienteId, 120),
          pacienteNome: sanitizeDocumentValue(data.pacienteNome, 160) || patient.fullName || patient.nome || '',
          profissionalId: sanitizeDocumentValue(data.profissionalId, 120),
          profissionalNome: sanitizeDocumentValue(data.profissionalNome, 160),
          data: normalizeDocumentDate(data.data) || data.data,
          tipo,
          dias: tipo === 'dias' ? Number(data.dias || 1) : 0,
          horaInicio: tipo === 'horas' ? sanitizeDocumentValue(data.horaInicio, 10) : '',
          horaFim: tipo === 'horas' ? sanitizeDocumentValue(data.horaFim, 10) : '',
          cid: sanitizeDocumentValue(data.cid, 200),
          assinatura: Boolean(data.assinatura),
        },
      };

      await writeJsonFile(targetPath, payloadToSave);
      const stat = await fsPromises.stat(targetPath);

      const docId = generateDocumentId();
      const title = sanitizeDocumentValue(payload.title, 120) || `Atestado ${now.toLocaleDateString('pt-BR')}`;
      const record = {
        id: docId,
        prontuario,
        category: 'clinicos',
        categoria: 'clinicos',
        type: 'Atestado',
        title,
        titulo: title,
        notes: sanitizeDocumentValue(payload.notes, 500),
        atendimentoId: sanitizeDocumentValue(payload.atendimentoId, 80),
        documentDate: normalizeDocumentDate(payload.data) || now.toISOString().split('T')[0],
        createdAt: now.toISOString(),
        createdBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        dentistaId: resolveDentistaId(patient),
        originalName: fileName,
        storedName: fileName,
        size: stat.size,
        extension: '.json',
        versionOf: docId,
        version: 1,
        isLatest: true,
        archived: false,
      };

      documents.push(record);
      await writePatientDocumentsIndex(prontuario, documents);

      const patientPath = path.join(patientsPath, `${prontuario}.json`);
      try {
        const patientData = await readJsonFile(patientPath);
        const atestados = Array.isArray(patientData.atestados) ? patientData.atestados : [];
        atestados.push({
          id: docId,
          data: payloadToSave.data.data,
          tipo,
          dias: payloadToSave.data.dias,
          horaInicio: payloadToSave.data.horaInicio,
          horaFim: payloadToSave.data.horaFim,
          cid: payloadToSave.data.cid,
          profissionalId: payloadToSave.data.profissionalId,
          profissionalNome: payloadToSave.data.profissionalNome,
          createdAt: now.toISOString(),
        });
        patientData.atestados = atestados;
        await writeJsonFile(patientPath, patientData);
      } catch (err) {
        console.warn('Nao foi possivel atualizar atestados no prontuario.', err);
      }

      const baseName = path.basename(targetPath, '.json');
      const pdfPath = path.join(filesDir, `${baseName}.pdf`);
      await generateAtestadoPdf({ jsonPath: targetPath, pdfPath, patient, doc: record });

      try {
        await syncDocumentMetadataToCentral({
          patient,
          prontuario,
          record,
          action: 'save-patient-atestado',
          uploadFiles: true,
        });
      } catch (error) {
        logDocumentFallback('save-patient-atestado', error, { prontuario, documentId: record.id });
      }

      return record;
    } catch (err) {
      console.error('[DOCUMENTS] save-patient-atestado', err);
      throw err;
    }
  });

  ipcMain.handle('save-patient-receita', async (_event, payload = {}) => {
    try {
      requireRole(['admin', 'recepcionista', 'dentista']);
      const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
      if (!prontuario) throw new Error('Prontuario obrigatorio.');
      const patient = await ensurePatientAccess(prontuario);
      validatePatientBinding({ patientId: payload.pacienteId, patient, prontuario });

      const data = payload;
      if (!data || typeof data !== 'object') throw new Error('Dados invalidos.');
      if (!data.data) throw new Error('Data obrigatoria.');
      if (!data.profissionalId) throw new Error('Profissional obrigatorio.');

      const textoLivre = sanitizeDocumentValue(data.texto, 5000);
      const itens = Array.isArray(data.itens) ? data.itens : [];
      if (!textoLivre && !itens.length) throw new Error('Informe o texto da receita ou os itens.');

      const itensSanitizados = itens
        .map((item) => ({
          nome: sanitizeDocumentValue(item?.nome, 200),
          posologia: sanitizeDocumentValue(item?.posologia, 300),
          quantidade: sanitizeDocumentValue(item?.quantidade, 120),
        }))
        .filter((item) => item.nome);

      const { filesDir } = await ensurePatientDocumentsDir(prontuario);
      const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const fileName = `receita-${stamp}.json`;
      const targetPath = path.join(filesDir, fileName);

      const payloadToSave = {
        prontuario,
        updatedAt: now.toISOString(),
        updatedBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        data: {
          prontuario,
          pacienteId: sanitizeDocumentValue(data.pacienteId, 120),
          pacienteNome: sanitizeDocumentValue(data.pacienteNome, 160) || patient.fullName || patient.nome || '',
          profissionalId: sanitizeDocumentValue(data.profissionalId, 120),
          profissionalNome: sanitizeDocumentValue(data.profissionalNome, 160),
          data: normalizeDocumentDate(data.data) || data.data,
          itens: itensSanitizados,
          texto: textoLivre,
          observacoes: sanitizeDocumentValue(data.observacoes, 1500),
        },
      };

      await writeJsonFile(targetPath, payloadToSave);
      const stat = await fsPromises.stat(targetPath);

      const docId = generateDocumentId();
      const title = sanitizeDocumentValue(payload.title, 120) || `Receita ${now.toLocaleDateString('pt-BR')}`;
      const record = {
        id: docId,
        prontuario,
        category: 'clinicos',
        categoria: 'clinicos',
        type: 'Receita',
        title,
        titulo: title,
        notes: sanitizeDocumentValue(payload.notes, 500),
        atendimentoId: sanitizeDocumentValue(payload.atendimentoId, 80),
        documentDate: normalizeDocumentDate(payload.data) || now.toISOString().split('T')[0],
        createdAt: now.toISOString(),
        createdBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        dentistaId: resolveDentistaId(patient),
        originalName: fileName,
        storedName: fileName,
        size: stat.size,
        extension: '.json',
        versionOf: docId,
        version: 1,
        isLatest: true,
        archived: false,
      };

      documents.push(record);
      await writePatientDocumentsIndex(prontuario, documents);

      const patientPath = path.join(patientsPath, `${prontuario}.json`);
      try {
        const patientData = await readJsonFile(patientPath);
        const receitas = Array.isArray(patientData.receitas) ? patientData.receitas : [];
        receitas.push({
          id: docId,
          data: payloadToSave.data.data,
          profissionalId: payloadToSave.data.profissionalId,
          profissionalNome: payloadToSave.data.profissionalNome,
          itens: payloadToSave.data.itens,
          texto: payloadToSave.data.texto,
          createdAt: now.toISOString(),
        });
        patientData.receitas = receitas;
        await writeJsonFile(patientPath, patientData);
      } catch (err) {
        console.warn('Nao foi possivel atualizar receitas no prontuario.', err);
      }

      const baseName = path.basename(targetPath, '.json');
      const pdfPath = path.join(filesDir, `${baseName}.pdf`);
      await generateReceitaPdf({ jsonPath: targetPath, pdfPath, patient, doc: record });

      try {
        await syncDocumentMetadataToCentral({
          patient,
          prontuario,
          record,
          action: 'save-patient-receita',
          uploadFiles: true,
        });
      } catch (error) {
        logDocumentFallback('save-patient-receita', error, { prontuario, documentId: record.id });
      }

      return record;
    } catch (err) {
      console.error('[DOCUMENTS] save-patient-receita', err);
      throw err;
    }
  });

  ipcMain.handle('save-patient-contrato', async (_event, payload = {}) => {
    try {
      requireRole(['admin', 'recepcionista', 'dentista']);
      const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
      if (!prontuario) throw new Error('Prontuario obrigatorio.');
      const patient = await ensurePatientAccess(prontuario);
      const pacienteId = validatePatientBinding({ patientId: payload.pacienteId, patient, prontuario });

      const conteudoContrato = String(payload.conteudoContrato || '').trim();
      if (!conteudoContrato) throw new Error('Conteudo do contrato obrigatorio.');

      const modelo = sanitizeDocumentValue(payload.modelo, 120);
      const now = new Date();
      const title = sanitizeDocumentValue(payload.title, 120)
        || sanitizeDocumentValue(payload.titulo, 120)
        || `Contrato ${now.toLocaleDateString('pt-BR')}`;
      const category = sanitizeDocumentValue(payload.category, 80)
        || sanitizeDocumentValue(payload.categoria, 80)
        || 'clinicos';

      const { filesDir } = await ensurePatientDocumentsDir(prontuario);
      const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const jsonName = `contrato-${stamp}.json`;
      const pdfName = `contrato-${stamp}.pdf`;
      const targetPath = path.join(filesDir, jsonName);

      const payloadToSave = {
        prontuario,
        updatedAt: now.toISOString(),
        updatedBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        data: {
          prontuario,
          pacienteId,
          pacienteNome: sanitizeDocumentValue(payload.pacienteNome, 160) || patient.fullName || patient.nome || '',
          modelo,
          conteudoContrato,
          data: normalizeDocumentDate(payload.data) || now.toISOString().split('T')[0],
        },
      };

      await writeJsonFile(targetPath, payloadToSave);
      const jsonStat = await fsPromises.stat(targetPath);
      const pdfPath = path.join(filesDir, pdfName);
      await generateContratoPdf({ jsonPath: targetPath, pdfPath, patient, doc: { title, type: 'CONTRATO' } });
      const pdfStat = await fsPromises.stat(pdfPath);
      const docId = generateDocumentId();
      const record = {
        id: docId,
        prontuario,
        category,
        categoria: category,
        type: 'CONTRATO',
        title,
        titulo: title,
        createdAt: now.toISOString(),
        documentDate: payloadToSave.data.data,
        createdBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        dentistaId: resolveDentistaId(patient),
        originalName: pdfName,
        storedName: pdfName,
        size: pdfStat.size,
        extension: '.pdf',
        sourceJsonName: jsonName,
        sourceJsonSize: jsonStat.size,
        versionOf: docId,
        version: 1,
        isLatest: true,
        archived: false,
        data: payloadToSave.data,
      };

      documents.push(record);
      await writePatientDocumentsIndex(prontuario, documents);
      try {
        await syncDocumentMetadataToCentral({
          patient,
          prontuario,
          record,
          action: 'save-patient-contrato',
          uploadFiles: true,
        });
      } catch (error) {
        logDocumentFallback('save-patient-contrato', error, { prontuario, documentId: record.id });
      }
      return record;
    } catch (err) {
      console.error('[DOCUMENTS] save-patient-contrato', err);
      throw err;
    }
  });

  ipcMain.handle('save-patient-evolucao', async (_event, payload = {}) => {
    try {
      requireRole(['admin', 'recepcionista', 'dentista']);
      const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
      if (!prontuario) throw new Error('Prontuario obrigatorio.');
      const patient = await ensurePatientAccess(prontuario);
      const pacienteId = validatePatientBinding({ patientId: payload.pacienteId, patient, prontuario });

      const texto = sanitizeDocumentValue(payload.texto, 5000);
      if (!texto) throw new Error('Texto da evolucao obrigatorio.');
      const profissionalId = sanitizeDocumentValue(payload.profissionalId, 120);
      if (!profissionalId) throw new Error('Profissional obrigatorio.');

      const now = new Date();
      const title = sanitizeDocumentValue(payload.title, 120)
        || sanitizeDocumentValue(payload.titulo, 120)
        || `Evolucao ${now.toLocaleDateString('pt-BR')}`;
      const category = sanitizeDocumentValue(payload.category, 80)
        || sanitizeDocumentValue(payload.categoria, 80)
        || 'clinicos';

      const { filesDir } = await ensurePatientDocumentsDir(prontuario);
      const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const fileName = `evolucao-${stamp}.json`;
      const targetPath = path.join(filesDir, fileName);

      const payloadToSave = {
        prontuario,
        updatedAt: now.toISOString(),
        updatedBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        data: {
          prontuario,
          pacienteId,
          pacienteNome: sanitizeDocumentValue(payload.pacienteNome, 160) || patient.fullName || patient.nome || '',
          profissionalId,
          profissionalNome: sanitizeDocumentValue(payload.profissionalNome, 160) || currentUserRef()?.nome || '',
          data: normalizeDocumentDate(payload.data) || now.toISOString().split('T')[0],
          texto,
          observacoes: sanitizeDocumentValue(payload.observacoes, 1500),
        },
      };

      await writeJsonFile(targetPath, payloadToSave);
      const stat = await fsPromises.stat(targetPath);
      const docId = generateDocumentId();
      const record = {
        id: docId,
        prontuario,
        category,
        categoria: category,
        type: 'EVOLUCAO',
        title,
        titulo: title,
        createdAt: now.toISOString(),
        documentDate: payloadToSave.data.data,
        createdBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        dentistaId: resolveDentistaId(patient),
        originalName: fileName,
        storedName: fileName,
        size: stat.size,
        extension: '.json',
        versionOf: docId,
        version: 1,
        isLatest: true,
        archived: false,
        data: payloadToSave.data,
      };

      documents.push(record);
      await writePatientDocumentsIndex(prontuario, documents);
      try {
        await syncDocumentMetadataToCentral({
          patient,
          prontuario,
          record,
          action: 'save-patient-evolucao:metadata',
          uploadFiles: true,
        });
        await centralBackendAdapter.createPatientClinicalNote({
          clinicId: getCurrentClinicId(),
          patient: { ...patient, clinicId: getCurrentClinicId() },
          noteType: 'EVOLUCAO',
          content: payloadToSave.data,
          document: record,
        });
        console.info('[PRONTUARIO] clinical note write central', JSON.stringify({
          clinicId: getCurrentClinicId(),
          patientId: patient?.id || patient?.prontuario || '',
          documentId: record.id,
        }));
      } catch (error) {
        logDocumentFallback('save-patient-evolucao', error, { prontuario, documentId: record.id });
      }
      return record;
    } catch (err) {
      console.error('[DOCUMENTS] save-patient-evolucao', err);
      throw err;
    }
  });

  ipcMain.handle('update-patient-evolucao', async (_event, payload = {}) => {
    try {
      requireRole(['admin', 'recepcionista', 'dentista']);
      const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
      if (!prontuario) throw new Error('Prontuario obrigatorio.');
      const patient = await ensurePatientAccess(prontuario);
      const pacienteId = validatePatientBinding({ patientId: payload.pacienteId, patient, prontuario });
      const documentId = sanitizeDocumentValue(payload.documentId, 120);
      if (!documentId) throw new Error('Documento de evolucao obrigatorio.');

      const texto = sanitizeDocumentValue(payload.texto, 5000);
      if (!texto) throw new Error('Texto da evolucao obrigatorio.');
      const profissionalId = sanitizeDocumentValue(payload.profissionalId, 120);
      if (!profissionalId) throw new Error('Profissional obrigatorio.');

      const now = new Date();
      const documents = await readMutableDocuments({ prontuario, patient, includeArchived: true });
      const index = documents.findIndex((doc) => doc.id === documentId && !doc.archived);
      if (index < 0) throw new Error('Evolucao nao encontrada.');
      const current = documents[index] || {};
      const currentType = String(current.type || current.tipo || '').toUpperCase();
      if (currentType !== 'EVOLUCAO' && currentType !== 'EVOLUCAO_CLINICA') {
        throw new Error('Documento informado nao e uma evolucao.');
      }

      const title = sanitizeDocumentValue(payload.title, 120)
        || sanitizeDocumentValue(payload.titulo, 120)
        || sanitizeDocumentValue(current.title, 120)
        || sanitizeDocumentValue(current.titulo, 120)
        || `Evolucao ${now.toLocaleDateString('pt-BR')}`;
      const category = sanitizeDocumentValue(payload.category, 80)
        || sanitizeDocumentValue(payload.categoria, 80)
        || sanitizeDocumentValue(current.category, 80)
        || sanitizeDocumentValue(current.categoria, 80)
        || 'clinicos';

      const { filesDir } = await ensurePatientDocumentsDir(prontuario);
      const baseName = sanitizeDocumentValue(current.storedName, 260)
        || sanitizeDocumentValue(current.originalName, 260)
        || `evolucao-${now.toISOString().replace(/[:.]/g, '-')}.json`;
      const storedName = baseName.endsWith('.json') ? baseName : `${baseName}.json`;
      const targetPath = path.join(filesDir, storedName);

      const payloadToSave = {
        prontuario,
        updatedAt: now.toISOString(),
        updatedBy: {
          id: currentUserRef()?.id || '',
          nome: currentUserRef()?.nome || '',
          tipo: currentUserRef()?.tipo || '',
        },
        data: {
          prontuario,
          pacienteId: pacienteId || current.data?.pacienteId || '',
          pacienteNome: sanitizeDocumentValue(payload.pacienteNome, 160)
            || sanitizeDocumentValue(current.data?.pacienteNome, 160)
            || patient.fullName
            || patient.nome
            || '',
          profissionalId,
          profissionalNome: sanitizeDocumentValue(payload.profissionalNome, 160) || currentUserRef()?.nome || '',
          data: normalizeDocumentDate(payload.data) || normalizeDocumentDate(current.documentDate) || now.toISOString().split('T')[0],
          texto,
          observacoes: sanitizeDocumentValue(payload.observacoes, 1500)
            || sanitizeDocumentValue(current.data?.observacoes, 1500),
        },
      };

      await writeJsonFile(targetPath, payloadToSave);
      const stat = await fsPromises.stat(targetPath);

      const updated = {
        ...current,
        prontuario,
        category,
        categoria: category,
        type: 'EVOLUCAO',
        title,
        titulo: title,
        documentDate: payloadToSave.data.data,
        dentistaId: resolveDentistaId(patient),
        originalName: storedName,
        storedName,
        size: stat.size,
        extension: '.json',
        updatedAt: now.toISOString(),
        updatedBy: payloadToSave.updatedBy,
        data: payloadToSave.data,
      };

      documents[index] = updated;
      await writePatientDocumentsIndex(prontuario, documents);
      try {
        await syncDocumentMetadataToCentral({
          patient,
          prontuario,
          record: updated,
          action: 'update-patient-evolucao:metadata',
          uploadFiles: true,
        });
        await centralBackendAdapter.updatePatientClinicalNote({
          clinicId: getCurrentClinicId(),
          patient: { ...patient, clinicId: getCurrentClinicId() },
          sourceDocumentId: documentId,
          content: payloadToSave.data,
          document: updated,
        });
        console.info('[PRONTUARIO] clinical note update central', JSON.stringify({
          clinicId: getCurrentClinicId(),
          patientId: patient?.id || patient?.prontuario || '',
          documentId,
        }));
      } catch (error) {
        logDocumentFallback('update-patient-evolucao', error, { prontuario, documentId });
      }
      return updated;
    } catch (err) {
      console.error('[DOCUMENTS] update-patient-evolucao', err);
      throw err;
    }
  });

  ipcMain.handle('open-latest-anamnese', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
    if (!prontuario) throw new Error('Prontuario obrigatorio.');
    const patient = await ensurePatientAccess(prontuario);

    const documents = (await loadDocumentsFromSource({ prontuario, patient, includeArchived: false })).documents;
    const list = documents.filter((doc) => normalizeDocType(doc.type || doc.tipo) === 'ANAMNESE' && !doc.archived);
    if (!list.length) throw new Error('Anamnese nao encontrada.');

    const latest = list.find((doc) => doc.isLatest)
      || list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];

    const { filesDir } = await ensurePatientDocumentsDir(prontuario);
    const targetPath = await ensureLocalDocumentAsset({ patient, prontuario, record: latest, role: 'primary' });

    const ext = String(latest.extension || path.extname(targetPath) || '').toLowerCase();
    if (ext === '.json') {
      const baseName = path.basename(targetPath, ext);
      const pdfPath = path.join(filesDir, `${baseName}.pdf`);
      let shouldGenerate = true;
      if (await pathExists(pdfPath)) {
        try {
          const [srcStat, pdfStat] = await Promise.all([
            fsPromises.stat(targetPath),
            fsPromises.stat(pdfPath),
          ]);
          shouldGenerate = srcStat.mtimeMs > pdfStat.mtimeMs;
        } catch (_) {
          shouldGenerate = true;
        }
      }
      if (shouldGenerate) {
        await generateAnamnesePdf({ jsonPath: targetPath, pdfPath, patient, doc: latest });
      }
      await shell.openPath(pdfPath);
      return latest;
    }

    await shell.openPath(targetPath);
    return latest;
  });

  ipcMain.handle('open-latest-receita', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const prontuario = sanitizeDocumentValue(payload.prontuario, 80);
    if (!prontuario) throw new Error('Prontuario obrigatorio.');
    const patient = await ensurePatientAccess(prontuario);

    const documents = (await loadDocumentsFromSource({ prontuario, patient, includeArchived: false })).documents;
    const list = documents.filter((doc) => normalizeDocType(doc.type || doc.tipo) === 'RECEITA' && !doc.archived);
    if (!list.length) throw new Error('Receita nao encontrada.');

    const latest = list.find((doc) => doc.isLatest)
      || list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];

    const { filesDir } = await ensurePatientDocumentsDir(prontuario);
    const targetPath = await ensureLocalDocumentAsset({ patient, prontuario, record: latest, role: 'primary' });

    const ext = String(latest.extension || path.extname(targetPath) || '').toLowerCase();
    if (ext === '.json') {
      const baseName = path.basename(targetPath, ext);
      const pdfPath = path.join(filesDir, `${baseName}.pdf`);
      let shouldGenerate = true;
      if (await pathExists(pdfPath)) {
        try {
          const [srcStat, pdfStat] = await Promise.all([
            fsPromises.stat(targetPath),
            fsPromises.stat(pdfPath),
          ]);
          shouldGenerate = srcStat.mtimeMs > pdfStat.mtimeMs;
        } catch (_) {
          shouldGenerate = true;
        }
      }
      if (shouldGenerate) {
        await generateReceitaPdf({ jsonPath: targetPath, pdfPath, patient, doc: latest });
      }
      await shell.openPath(pdfPath);
      return latest;
    }

    await shell.openPath(targetPath);
    return latest;
  });

  ipcMain.handle('read-service-files', async () => {
    requireRole(['admin']);
    return readDirectoryFiles(servicesPath);
  });

  ipcMain.handle('read-receipt-files', async () => {
    requireRole(['admin', 'recepcionista']);
    return readDirectoryFiles(receiptsPath);
  });

  ipcMain.handle('open-file', async (_event, filePath) => {
    requireRole(['admin', 'recepcionista']);
    if (!filePath || !filePath.startsWith(userDataPath)) throw new Error('Acesso negado.');
    if (!(await pathExists(filePath))) throw new Error('Arquivo nao encontrado.');
    await shell.openPath(filePath);
    return { success: true };
  });

  return { readPatientFilesDetailed };
};

module.exports = { registerDocumentsHandlers };
