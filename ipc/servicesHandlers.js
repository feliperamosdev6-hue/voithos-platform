const { SOURCE, withSource } = require('../shared/utils/hybrid-source-utils');

const registerServicesHandlers = ({
  ipcMain,
  requireRole,
  addServiceRecord,
  findServiceByCode,
  listServicesSummary,
  addServiceToPatient,
  listAllServices,
  updateService,
  deleteServiceRecord,
  addServiceWithAppointment,
  deleteService,
  listServicesForPatient,
  loadProcedures,
  createOrUpdateProcedureRevenue,
  generateFinanceId,
  readFinance,
  writeFinance,
  readLaboratorio,
  writeLaboratorio,
  generateLaboratorioId,
  readPatient,
  savePatient,
  currentUserRef,
  centralBackendAdapter,
}) => {
  const normalizePaymentMethod = (value) => {
    const raw = String(value || '').toUpperCase().trim();
    const allowed = new Set(['PIX', 'CREDIT', 'DEBIT', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER']);
    if (allowed.has(raw)) return raw;
    if (raw === 'CARTAO_CREDITO' || raw === 'CREDITO') return 'CREDIT';
    if (raw === 'CARTAO_DEBITO' || raw === 'DEBITO') return 'DEBIT';
    if (raw === 'DINHEIRO') return 'CASH';
    if (raw === 'TRANSFERENCIA') return 'TRANSFER';
    if (raw === 'OUTRO') return 'OTHER';
    return 'PIX';
  };
  const normalizePaymentStatus = (value) => {
    const raw = String(value || '').toUpperCase().trim();
    if (raw === 'PENDING' || raw === 'PENDENTE' || raw === 'OPEN' || raw === 'PARTIAL') return 'PENDING';
    if (raw === 'CANCELLED' || raw === 'CANCELADO') return 'CANCELLED';
    if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
    return 'PENDING';
  };
  const toDateOnly = (value) => {
    if (!value) return new Date().toISOString().split('T')[0];
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return new Date().toISOString().split('T')[0];
    return dt.toISOString().split('T')[0];
  };
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const getCurrentClinicId = () => String(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const isCentralEnabled = () => centralBackendAdapter?.isEnabled?.() === true;
  const shouldFallbackToLocal = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    const status = Number(error?.status || 0);
    return code === 'CENTRAL_BACKEND_UNAVAILABLE'
      || code === 'CENTRAL_BACKEND_TIMEOUT'
      || error?.name === 'AbortError'
      || status >= 500;
  };
  const generateClinicalExternalId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let centralLogged = false;
  const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const cleanText = (value) => String(value || '').trim();
  const logCentralActive = () => {
    if (centralLogged) return;
    centralLogged = true;
    console.info('[PRONTUARIO] procedures central backend active');
  };
  const logClinicalFallback = (action, error) => {
    console.warn('[PRONTUARIO] procedures fallback to local', JSON.stringify({
      action,
      procedure_fallback_to_local: true,
      clinical_fallback_to_local: true,
      clinicId: getCurrentClinicId(),
      failure_layer: 'central-read',
      reason: error?.message || String(error || ''),
    }));
  };
  const logShadowDivergence = ({ patient, localResult, centralProcedures }) => {
    const localIds = new Set((Array.isArray(localResult?.servicos) ? localResult.servicos : []).map((item) => cleanText(item?.id)).filter(Boolean));
    const centralIds = new Set((Array.isArray(centralProcedures) ? centralProcedures : []).map((item) => cleanText(item?.id)).filter(Boolean));
    if (!localIds.size && !centralIds.size) return;
    if (localIds.size === centralIds.size && Array.from(centralIds).every((id) => localIds.has(id))) return;
    console.warn('[PRONTUARIO] shadow_divergence_detected=true', JSON.stringify({
      clinicId: getCurrentClinicId(),
      patientId: cleanText(patient?.id || patient?.prontuario),
      procedureId: '',
      financeId: '',
      failure_layer: 'shadow-divergence',
      centralCount: centralIds.size,
      localCount: localIds.size,
    }));
  };
  const mapCentralProcedure = (item = {}) => withSource(item, SOURCE.CENTRAL);
  const ensurePatientShadow = async (prontuario) => {
    const normalized = cleanText(prontuario);
    if (!normalized || !isCentralEnabled() || typeof savePatient !== 'function') return null;

    const centralPatient = await centralBackendAdapter.getPatientById(normalized, { clinicId: getCurrentClinicId() });
    if (!centralPatient) return null;

    await savePatient({
      ...centralPatient,
      id: centralPatient.id,
      prontuario: centralPatient.prontuario || centralPatient.id,
      nome: centralPatient.nome || centralPatient.fullName || '',
      fullName: centralPatient.fullName || centralPatient.nome || '',
      clinicId: getCurrentClinicId(),
    });

    return readPatient(centralPatient.prontuario || centralPatient.id);
  };
  const readPatientWithShadowSync = async (prontuario) => {
    try {
      return await readPatient(prontuario);
    } catch (error) {
      if (!isCentralEnabled()) throw error;
      try {
        return await ensurePatientShadow(prontuario);
      } catch (_) {
        throw error;
      }
    }
  };
  const loadProceduresFromSource = async (prontuario) => {
    const patient = await readPatientWithShadowSync(prontuario);
    if (!isCentralEnabled()) {
      const localResult = await listServicesForPatient(prontuario);
      return {
        source: 'local',
        patient,
        procedures: Array.isArray(localResult?.servicos) ? localResult.servicos : [],
        patientSummary: localResult && typeof localResult === 'object' ? localResult : null,
      };
    }

    try {
      logCentralActive();
      const central = await centralBackendAdapter.listPatientProcedures({
        clinicId: getCurrentClinicId(),
        patient: { ...patient, clinicId: getCurrentClinicId() },
      });
      if (!Array.isArray(central)) {
        const shapeError = new Error('Central procedure payload inválido.');
        shapeError.code = 'CENTRAL_PROCEDURE_PAYLOAD_INVALID';
        throw shapeError;
      }
      const localResult = await listServicesForPatient(prontuario).catch(() => null);
      logShadowDivergence({ patient, localResult, centralProcedures: central });
      console.info('[PRONTUARIO] clinical_loaded_from=central', JSON.stringify({
        clinicId: getCurrentClinicId(),
        patientId: patient?.id || patient?.prontuario || '',
        dataType: 'procedure',
        source: 'central',
        count: central.length,
      }));
      console.info('[PRONTUARIO] procedure_read_source=central', JSON.stringify({
        clinicId: getCurrentClinicId(),
        patientId: cleanText(patient?.id || patient?.prontuario),
        procedureId: '',
        financeId: '',
        failure_layer: '',
        count: central.length,
      }));
      return {
        source: 'central',
        patient,
        procedures: central.map(mapCentralProcedure),
        patientSummary: {
          nome: patient?.fullName || patient?.nome || '',
          cpf: patient?.cpf || '',
          prontuario: patient?.prontuario || prontuario,
        },
      };
    } catch (error) {
      if (!shouldFallbackToLocal(error)) {
        throw error;
      }
      logClinicalFallback('load-procedures', error);
      const localResult = await listServicesForPatient(prontuario);
      return {
        source: 'local',
        patient,
        procedures: Array.isArray(localResult?.servicos) ? localResult.servicos : [],
        patientSummary: localResult && typeof localResult === 'object' ? localResult : null,
      };
    }
  };
  const syncProcedureToCentral = async ({ prontuario, patient, service, stage }) => {
    if (!isCentralEnabled()) return null;
    const localPatient = patient || await readPatient(prontuario);
    const clinicId = getCurrentClinicId();
    logCentralActive();
    const procedurePayload = {
      ...(service || {}),
      id: cleanText(service?.id) || generateClinicalExternalId(),
      patientProntuario: localPatient?.prontuario || prontuario,
    };
    const result = await centralBackendAdapter.upsertPatientProcedure({
      clinicId,
      patient: {
        ...localPatient,
        clinicId,
      },
      procedure: procedurePayload,
    });
    console.info('[PRONTUARIO] procedure write central', JSON.stringify({
      stage,
      clinicId,
      patientId: localPatient?.id || localPatient?.prontuario || '',
      procedureId: procedurePayload.id,
    }));
    return result;
  };
  const normalizeProcedureState = (value) => {
    const raw = cleanText(value).toLowerCase();
    if (raw === 'realizado') return 'realizado';
    if (raw === 'a-realizar' || raw === 'a realizar') return 'a-realizar';
    if (raw === 'pre-existente' || raw === 'pre existente') return 'pre-existente';
    return raw;
  };
  const paymentMethodToFinance = (value) => {
    const upper = normalizePaymentMethod(value);
    const map = {
      PIX: 'pix',
      CREDIT: 'cartao_credito',
      DEBIT: 'cartao_debito',
      CASH: 'dinheiro',
      BOLETO: 'boleto',
      TRANSFER: 'transferencia',
      OTHER: 'outro',
    };
    return map[upper] || '';
  };
  const paymentStatusToFinance = (value) => {
    const upper = normalizePaymentStatus(value);
    if (upper === 'PENDING') return 'pendente';
    if (upper === 'CANCELLED') return 'cancelado';
    return 'pago';
  };
  const shadowUpsertFinance = async (entry = {}) => {
    if (!readFinance || !writeFinance || !entry?.id) return;
    const list = await readFinance();
    const idx = list.findIndex((item) => String(item?.id || '') === String(entry.id || ''));
    if (idx >= 0) list[idx] = { ...list[idx], ...entry };
    else list.push(entry);
    await writeFinance(list);
  };
  const shadowDeleteFinance = async (id) => {
    if (!readFinance || !writeFinance || !id) return;
    const list = await readFinance();
    const filtered = list.filter((item) => !(String(item?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId() && String(item?.id || '') === String(id || '')));
    if (filtered.length !== list.length) await writeFinance(filtered);
  };
  const upsertProcedureRevenueEntry = async (payload = {}) => {
    if (isCentralEnabled()) {
      const account = await centralBackendAdapter.createFinancialAccount({
        clinicId: getCurrentClinicId(),
        patient: { id: payload?.patientId || payload?.prontuario || '' },
        account: {
          patientId: payload?.patientId || payload?.prontuario || '',
          description: payload?.descricao || `Procedimento: ${payload?.procedureName || 'Procedimento'}`,
          totalAmount: payload?.valor || 0,
          category: 'procedimentos',
          source: 'procedimento',
          type: 'receita',
          paymentMethod: payload?.paymentMethod || payload?.metodoPagamento || '',
          dueDate: payload?.dueDate || payload?.data || null,
          installments: payload?.installments ?? null,
          appointmentId: payload?.appointmentId || '',
          procedureId: payload?.procedureId || '',
          patientName: payload?.patientName || '',
          procedureName: payload?.procedureName || '',
          funcionario: payload?.funcionario || payload?.dentistaNome || '',
          dentistaId: payload?.dentistaId || '',
          dentistaNome: payload?.dentistaNome || payload?.funcionario || '',
          prontuario: payload?.prontuario || payload?.patientId || '',
          externalReference: payload?.procedureId || payload?.financeEntryId || '',
        },
      });
      await shadowUpsertFinance(account);
      console.info('[FINANCEIRO]', JSON.stringify({
        action: 'financial_created',
        clinicId: getCurrentClinicId(),
        patientId: payload?.patientId || '',
        accountId: account?.id || '',
        source: 'central',
      }));
      return account;
    }
    const lancamento = await createOrUpdateProcedureRevenue(payload);
    await shadowUpsertFinance(lancamento);
    return lancamento;
  };
  const deleteProcedureRevenueEntry = async ({ financeId, serviceId }) => {
    if (isCentralEnabled() && financeId) {
      try {
        await centralBackendAdapter.deleteFinancialAccount({
          clinicId: getCurrentClinicId(),
          accountId: financeId,
        });
      } catch (error) {
        console.warn('[FINANCEIRO] procedure delete central account failed', error);
      }
    }
    await shadowDeleteFinance(financeId);
    await removeProcedureFinanceEntries({ financeId, serviceId });
  };
  const getProcedureIntegrationIds = (service = {}) => ({
    labExpenseId: cleanText(service?.integracoes?.financeiro?.despesaLaboratorioId),
    labRegistroId: cleanText(service?.integracoes?.laboratorio?.registroId),
  });
  const isProcedureReadyForCostSync = (service = {}) => {
    const status = normalizeProcedureState(service.status || service.estado || service.situacao);
    const procFinanceStatus = cleanText(service.statusFinanceiroProcedimento).toLowerCase();
    return status === 'realizado' || procFinanceStatus === 'finalizado' || !!service.dataRealizacao;
  };
  const logLaboratorioFallback = (action, error, extra = {}) => {
    console.warn('[LABORATORIO]', JSON.stringify({
      action,
      clinicId: getCurrentClinicId(),
      laboratory_fallback_to_local: true,
      reason: error?.message || String(error || ''),
      ...extra,
    }));
  };
  const shadowUpsertLaboratorio = async (registro = {}) => {
    if (!readLaboratorio || !writeLaboratorio || !registro?.id) return;
    const list = await readLaboratorio();
    const idx = list.findIndex((item) => String(item?.id || '') === String(registro?.id || ''));
    if (idx >= 0) list[idx] = { ...list[idx], ...registro };
    else list.push(registro);
    await writeLaboratorio(list);
  };
  const buildProcedureLaboratoryPayload = ({ patient, service, financeExpenseId }) => {
    const nowIso = new Date().toISOString();
    const descricaoLab = cleanText(service?.custos?.laboratorio?.descricao);
    const procedureName = cleanText(service?.tipo || service?.nome || service?.procedimento || 'Procedimento');
    const patientName = cleanText(patient?.fullName || patient?.nome || service?.paciente || '');
    return {
      procedureId: cleanText(service?.id),
      appointmentId: cleanText(service?.appointmentId || service?.agendamentoId),
      labName: descricaoLab || 'Procedimento vinculado',
      description: procedureName,
      status: String(service?.integracoes?.laboratorio?.status || service?.laboratorioStatus || 'REQUESTED').trim() || 'REQUESTED',
      requestedAt: service?.dataRealizacao || service?.finishedAt || service?.updatedAt || nowIso,
      expectedAt: service?.custos?.laboratorio?.previsaoEntrega || service?.saida || null,
      notes: service?.custos?.laboratorio?.observacoes || '',
      totalCost: toNumber(service?.custos?.laboratorio?.valor),
      paciente: patientName,
      peca: procedureName,
      prontuario: patient?.prontuario || service?.patientProntuario || '',
      financeExpenseId: cleanText(financeExpenseId),
    };
  };

  const removeProcedureLaboratorioRecords = async ({ registroId, serviceId, prontuario }) => {
    const clinicId = getCurrentClinicId();
    const targetRegistroId = cleanText(registroId);
    const targetServiceId = cleanText(serviceId);
    const targetProntuario = cleanText(prontuario);
    if (!targetRegistroId && !targetServiceId) return;

    if (isCentralEnabled() && targetRegistroId) {
      try {
        await centralBackendAdapter.deleteLaboratoryOrder({
          clinicId,
          orderId: targetRegistroId,
        });
      } catch (error) {
        logLaboratorioFallback('procedure-laboratory-delete-central', error, {
          orderId: targetRegistroId,
          procedureId: targetServiceId,
        });
      }
    }

    if (!readLaboratorio || !writeLaboratorio) return;
    const list = await readLaboratorio();
    if (!Array.isArray(list) || !list.length) return;
    const filtered = list.filter((item) => {
      const sameClinic = String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId;
      if (!sameClinic) return true;
      if (targetRegistroId && String(item?.id || '') === targetRegistroId) return false;
      if (!targetServiceId) return true;
      const itemProcedureId = cleanText(item?.procedureId || item?.servicoId);
      if (itemProcedureId !== targetServiceId) return true;
      const entryProntuario = cleanText(item?.prontuario);
      if (!targetProntuario || !entryProntuario) return false;
      return entryProntuario !== targetProntuario;
    });
    if (filtered.length !== list.length) {
      await writeLaboratorio(filtered);
    }
  };

  const upsertProcedureLaboratorioExpense = async ({ patient, service }) => {
    if (!readFinance || !writeFinance || !generateFinanceId) return '';
    const clinicId = getCurrentClinicId();
    const nowIso = new Date().toISOString();
    const userId = currentUserRef?.()?.id || '';
    const procedureId = cleanText(service?.id);
    if (!procedureId) return '';
    const { labExpenseId } = getProcedureIntegrationIds(service);
    const valor = toNumber(service?.custos?.laboratorio?.valor);
    const list = await readFinance();
    const idx = list.findIndex((item) => {
      const sameClinic = String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId;
      if (!sameClinic) return false;
      if (labExpenseId && String(item?.id || '') === labExpenseId) return true;
      if (String(item?.tipo || '') !== 'despesa') return false;
      if (cleanText(item?.procedureId || item?.servicoId) !== procedureId) return false;
      const kind = cleanText(item?.procedureExpenseKind).toLowerCase();
      if (kind) return kind === 'laboratorio';
      return cleanText(item?.origem).toLowerCase() === 'procedimento'
        && cleanText(item?.categoria).toLowerCase() === 'laboratorio';
    });

    if (valor <= 0) {
      if (idx >= 0) {
        list.splice(idx, 1);
        await writeFinance(list);
      }
      return '';
    }

    const base = idx >= 0 ? (list[idx] || {}) : {};
    const id = cleanText(base.id) || generateFinanceId();
    const procedureName = cleanText(service?.tipo || service?.nome || service?.procedimento || 'Procedimento');
    const pacienteNome = cleanText(patient?.fullName || patient?.nome || service?.paciente || '');
    const labDescricao = cleanText(service?.custos?.laboratorio?.descricao);
    const paymentStatus = normalizePaymentStatus(base.paymentStatus || base.status || 'PENDING');
    const paymentMethod = normalizePaymentMethod(base.paymentMethod || base.metodoPagamento || '');
    const dueDate = base.dueDate || base.vencimento || null;
    const dataRef = toDateOnly(service?.dataRealizacao || service?.finishedAt || service?.updatedAt || nowIso);
    const descricao = labDescricao
      ? `[Lab] ${procedureName} - ${labDescricao}${pacienteNome ? ` - ${pacienteNome}` : ''}`
      : `[Lab] ${procedureName}${pacienteNome ? ` - ${pacienteNome}` : ''}`;

    const entry = {
      ...base,
      id,
      clinicId,
      tipo: 'despesa',
      categoria: 'laboratorio',
      origem: 'procedimento',
      procedureExpenseKind: 'laboratorio',
      descricao,
      valor,
      status: paymentStatusToFinance(paymentStatus),
      paymentStatus,
      metodoPagamento: paymentMethodToFinance(paymentMethod),
      paymentMethod: paymentMethod || '',
      dueDate,
      vencimento: dueDate,
      paidAt: paymentStatus === 'PAID' ? (base.paidAt || nowIso) : null,
      installments: base.installments ?? null,
      patientId: patient?.id || patient?._id || service?.patientId || '',
      prontuario: patient?.prontuario || service?.patientProntuario || '',
      paciente: pacienteNome,
      procedureId,
      servicoId: procedureId,
      procedimento: procedureName,
      funcionario: base.funcionario || '',
      planoFinalizado: !!base.planoFinalizado,
      data: dataRef,
      createdAt: base.createdAt || nowIso,
      createdBy: base.createdBy || userId,
      updatedAt: nowIso,
      updatedBy: userId,
    };

    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    await writeFinance(list);
    return id;
  };

  const upsertProcedureLaboratorioRecord = async ({ patient, service, financeExpenseId }) => {
    const clinicId = getCurrentClinicId();
    const procedureId = cleanText(service?.id);
    if (!procedureId) return '';
    const { labRegistroId } = getProcedureIntegrationIds(service);
    const valor = toNumber(service?.custos?.laboratorio?.valor);

    if (isCentralEnabled()) {
      if (valor <= 0) {
        if (labRegistroId) {
          try {
            await centralBackendAdapter.deleteLaboratoryOrder({
              clinicId,
              orderId: labRegistroId,
            });
          } catch (error) {
            logLaboratorioFallback('procedure-laboratory-delete-central', error, {
              orderId: labRegistroId,
              procedureId,
            });
          }
        }
        await removeProcedureLaboratorioRecords({
          registroId: labRegistroId,
          serviceId: procedureId,
          prontuario: patient?.prontuario || service?.patientProntuario || '',
        });
        return '';
      }

      const orderPayload = buildProcedureLaboratoryPayload({ patient, service, financeExpenseId });
      try {
        const registro = labRegistroId
          ? await centralBackendAdapter.updateLaboratoryOrder({
              clinicId,
              orderId: labRegistroId,
              order: orderPayload,
            })
          : await centralBackendAdapter.createLaboratoryOrder({
              clinicId,
              patient: {
                ...patient,
                id: patient?.id || patient?._id || service?.patientId || '',
                clinicId,
              },
              appointment: {
                id: orderPayload.appointmentId || '',
                clinicId,
              },
              order: orderPayload,
            });
        await shadowUpsertLaboratorio(registro);
        console.info('[LABORATORIO]', JSON.stringify({
          action: labRegistroId ? 'laboratory_order_updated' : 'laboratory_order_created',
          clinicId,
          patientId: registro?.patientId || patient?.id || patient?.prontuario || '',
          orderId: registro?.id || '',
          procedureId,
          status: registro?.centralStatus || '',
        }));
        return cleanText(registro?.id);
      } catch (error) {
        logLaboratorioFallback('procedure-laboratory-upsert-central', error, {
          procedureId,
          orderId: labRegistroId,
        });
        return labRegistroId || '';
      }
    }

    if (!readLaboratorio || !writeLaboratorio || !generateLaboratorioId) return '';
    const nowIso = new Date().toISOString();
    const list = await readLaboratorio();
    const idx = list.findIndex((item) => {
      const sameClinic = String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId;
      if (!sameClinic) return false;
      if (labRegistroId && String(item?.id || '') === labRegistroId) return true;
      return cleanText(item?.procedureId || item?.servicoId) === procedureId;
    });

    if (valor <= 0) {
      if (idx >= 0) {
        list.splice(idx, 1);
        await writeLaboratorio(list);
      }
      return '';
    }

    const base = idx >= 0 ? (list[idx] || {}) : {};
    const descricaoLab = cleanText(service?.custos?.laboratorio?.descricao);
    const procedureName = cleanText(service?.tipo || service?.nome || service?.procedimento || 'Procedimento');
    const patientName = cleanText(patient?.fullName || patient?.nome || service?.paciente || '');
    const entrada = toDateOnly(service?.dataRealizacao || service?.finishedAt || service?.updatedAt || nowIso);
    const registro = {
      ...base,
      id: cleanText(base.id) || generateLaboratorioId(),
      clinicId,
      laboratorio: descricaoLab || base.laboratorio || 'Procedimento vinculado',
      paciente: patientName || base.paciente || '',
      peca: procedureName || base.peca || '',
      entrada,
      saida: base.saida || '',
      valor,
      status: base.status || 'pendente',
      origem: 'procedimento',
      procedureId,
      servicoId: procedureId,
      patientId: patient?.id || patient?._id || service?.patientId || '',
      prontuario: patient?.prontuario || service?.patientProntuario || '',
      financeExpenseId: cleanText(financeExpenseId) || cleanText(base.financeExpenseId),
      createdAt: base.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (idx >= 0) list[idx] = registro;
    else list.push(registro);
    await writeLaboratorio(list);
    return registro.id;
  };

  const syncProcedureLabCostIntegrations = async ({ patient, service }) => {
    const procedureId = cleanText(service?.id);
    if (!procedureId) return { labExpenseId: '', labRegistroId: '' };
    const shouldSync = isProcedureReadyForCostSync(service);
    const valor = toNumber(service?.custos?.laboratorio?.valor);
    const existing = getProcedureIntegrationIds(service);

    if (!shouldSync || valor <= 0) {
      await upsertProcedureLaboratorioExpense({ patient, service: { ...service, custos: { ...(service.custos || {}), laboratorio: { ...(service?.custos?.laboratorio || {}), valor: 0 } } } });
      await upsertProcedureLaboratorioRecord({ patient, service: { ...service, custos: { ...(service.custos || {}), laboratorio: { ...(service?.custos?.laboratorio || {}), valor: 0 } } } });
      return { labExpenseId: '', labRegistroId: '', removed: Boolean(existing.labExpenseId || existing.labRegistroId) };
    }

    const labExpenseId = await upsertProcedureLaboratorioExpense({ patient, service });
    const labRegistroId = await upsertProcedureLaboratorioRecord({ patient, service, financeExpenseId: labExpenseId });
    return { labExpenseId, labRegistroId, removed: false };
  };

  const removeProcedureFinanceEntries = async ({ financeId, serviceId, prontuario }) => {
    if (!readFinance || !writeFinance) return;
    const clinicId = getCurrentClinicId();
    const targetFinanceId = String(financeId || '').trim();
    const targetServiceId = String(serviceId || '').trim();
    const targetProntuario = String(prontuario || '').trim();
    if (!targetFinanceId && !targetServiceId) return;

    const list = await readFinance();
    if (!Array.isArray(list) || !list.length) return;
    const filtered = (Array.isArray(list) ? list : []).filter((item) => {
      const sameClinic = String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId;
      if (!sameClinic) return true;

      const sameId = targetFinanceId && String(item?.id || '') === targetFinanceId;
      if (sameId) return false;

      if (!targetServiceId) return true;
      const sameProcedure = String(item?.procedureId || item?.servicoId || '') === targetServiceId;
      if (!sameProcedure) return true;
      const isProcedureEntry = String(item?.origem || '').toLowerCase() === 'procedimento'
        || String(item?.categoria || '').toLowerCase() === 'procedimentos';
      if (!isProcedureEntry) return true;

      const entryProntuario = String(item?.prontuario || '').trim();
      if (!targetProntuario || !entryProntuario) return false;
      return entryProntuario !== targetProntuario;
    });

    if (filtered.length !== list.length) {
      await writeFinance(filtered);
    }
  };

  ipcMain.handle('save-service-record', async (_event, { prontuario, record }) => {
    requireRole(['admin']);
    return addServiceRecord({ prontuario, record });
  });

  ipcMain.handle('find-service-by-code', async (_event, serviceIdOrCode) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return findServiceByCode(serviceIdOrCode);
  });

  ipcMain.handle('list-services', async () => {
    requireRole(['admin', 'recepcionista']);
    return listServicesSummary();
  });

  ipcMain.handle('add-service-to-patient', async (_event, { prontuario, service }) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const normalizedService = {
      ...(service || {}),
      id: cleanText(service?.id) || generateClinicalExternalId(),
    };
    console.info('[PRONTUARIO] procedure_save_started', JSON.stringify({
      clinicId: getCurrentClinicId(),
      userId: cleanText(currentUserRef?.()?.id),
      prontuario: cleanText(prontuario),
      selected_dentist_id: cleanText(normalizedService?.dentistaId),
      selected_procedure_id: cleanText(normalizedService?.codigo || normalizedService?.tipo || normalizedService?.nome),
      failure_layer: '',
    }));
    let patient = null;

    try {
      patient = await readPatientWithShadowSync(prontuario);
      console.info('[PRONTUARIO] dentist_validation_result', JSON.stringify({
        clinicId: getCurrentClinicId(),
        userId: cleanText(currentUserRef?.()?.id),
        patientId: cleanText(patient?.id || patient?.prontuario),
        procedureId: cleanText(normalizedService?.id),
        selected_dentist_id: cleanText(normalizedService?.dentistaId),
        patient_current_dentist_id: cleanText(patient?.dentistaId),
        result: cleanText(normalizedService?.dentistaId) ? 'selected_dentist_present' : 'selected_dentist_optional',
      }));
      if (isCentralEnabled()) {
        await syncProcedureToCentral({
          prontuario,
          patient,
          service: normalizedService,
          stage: 'create-pre-shadow',
        });
      }
    } catch (error) {
      if (isCentralEnabled()) logClinicalFallback('add-service-to-patient:pre', error);
    }

    let result = null;
    try {
      result = await addServiceToPatient({ prontuario, service: normalizedService });
    } catch (error) {
      if (String(error?.code || '') === 'DENTIST_TRANSFER_CONFIRMATION_REQUIRED') {
        console.info('[PRONTUARIO] dentist_transfer_confirmation_required', JSON.stringify({
          clinicId: getCurrentClinicId(),
          userId: cleanText(currentUserRef?.()?.id),
          patientId: cleanText(patient?.id || patient?.prontuario || prontuario),
          procedureId: cleanText(normalizedService?.id),
          selected_dentist_id: cleanText(error?.details?.selectedDentistId),
          patient_current_dentist_id: cleanText(error?.details?.patientCurrentDentistId),
        }));
        return {
          success: false,
          transferRequired: true,
          conflict: {
            patientCurrentDentistId: cleanText(error?.details?.patientCurrentDentistId),
            patientCurrentDentistName: cleanText(error?.details?.patientCurrentDentistName),
            selectedDentistId: cleanText(error?.details?.selectedDentistId),
            selectedDentistName: cleanText(error?.details?.selectedDentistName),
          },
        };
      }
      console.warn('[PRONTUARIO] procedure_save_failed', JSON.stringify({
        clinicId: getCurrentClinicId(),
        userId: cleanText(currentUserRef?.()?.id),
        prontuario: cleanText(prontuario),
        selected_dentist_id: cleanText(normalizedService?.dentistaId),
        patient_current_dentist_id: cleanText(patient?.dentistaId),
        selected_procedure_id: cleanText(normalizedService?.codigo || normalizedService?.tipo || normalizedService?.nome),
        failure_layer: 'service-local',
        message: error?.message || String(error),
      }));
      throw error;
    }
    const createdService = result?.service || {};
    console.info('[PRONTUARIO] procedure_saved', JSON.stringify({
      clinicId: getCurrentClinicId(),
      userId: cleanText(currentUserRef?.()?.id),
      patientId: cleanText(patient?.id || patient?.prontuario || prontuario),
      procedureId: cleanText(createdService?.id || normalizedService?.id),
      status: cleanText(createdService?.status || createdService?.estado || createdService?.situacao || 'a-realizar'),
      source: isCentralEnabled() ? 'central-first' : 'local',
    }));
    let financeId = createdService.financeiroId || createdService?.financeiro?.financeEntryId || '';
    let financeCreated = false;
    let syncedService = createdService;

    try {
      const valor = Number(
        createdService.valorCobrado !== undefined
          ? createdService.valorCobrado
          : (createdService.valor || createdService.value || 0)
      );
      if (valor > 0) {
        patient = patient || await readPatientWithShadowSync(prontuario);
        const prevId = financeId || '';
        console.info('[PRONTUARIO] procedure_financial_sync_started', JSON.stringify({
          clinicId: getCurrentClinicId(),
          userId: cleanText(currentUserRef?.()?.id),
          patientId: cleanText(patient?.id || patient?.prontuario || prontuario),
          procedureId: cleanText(createdService?.id || normalizedService?.id),
          status: 'PENDING',
          previousFinanceId: cleanText(prevId),
        }));
        const lancamento = await upsertProcedureRevenueEntry({
          financeEntryId: prevId,
          procedureId: createdService.id || '',
          patientId: patient.id || patient._id || '',
          prontuario: patient.prontuario || prontuario,
          patientName: patient.fullName || patient.nome || '',
          procedureName: createdService.tipo || createdService.nome || createdService.procedimento || 'Procedimento',
          funcionario: createdService.dentistaNome || createdService.dentista || '',
          dentistaId: createdService.dentistaId || '',
          dentistaNome: createdService.dentistaNome || createdService.dentista || '',
          descricao: `Procedimento: ${createdService.tipo || createdService.nome || createdService.procedimento || 'Procedimento'}`,
          valor,
          status: 'PENDING',
          paymentMethod: 'PIX',
          dueDate: null,
          installments: null,
          data: toDateOnly(new Date().toISOString()),
        });
        financeId = lancamento.id;
        financeCreated = !prevId;
        console.info('[PRONTUARIO] procedure_financial_sync_completed', JSON.stringify({
          clinicId: getCurrentClinicId(),
          userId: cleanText(currentUserRef?.()?.id),
          patientId: cleanText(patient?.id || patient?.prontuario || prontuario),
          procedureId: cleanText(createdService?.id || normalizedService?.id),
          status: 'PENDING',
          financeId: cleanText(financeId),
          financeCreated,
        }));

        const financeSnapshot = {
          ...(createdService.financeiro || {}),
          financeEntryId: financeId,
          paymentStatus: 'PENDING',
          paymentMethod: 'PIX',
          paidAt: null,
          dueDate: null,
          installments: null,
        };
        const updateResult = await updateService({
          prontuario,
          service: {
            id: createdService.id,
            financeiroId: financeId,
            paymentStatus: 'PENDING',
            paymentMethod: 'PIX',
            paidAt: null,
            vencimento: null,
            financeiro: financeSnapshot,
          },
        });
        syncedService = updateResult?.service || {
          ...createdService,
          financeiroId: financeId,
          paymentStatus: 'PENDING',
          paymentMethod: 'PIX',
          paidAt: null,
          vencimento: null,
          financeiro: financeSnapshot,
        };
      }
    } catch (err) {
      console.warn('[PRONTUARIO] procedure_financial_sync_failed', JSON.stringify({
        clinicId: getCurrentClinicId(),
        userId: cleanText(currentUserRef?.()?.id),
        patientId: cleanText(patient?.id || patient?.prontuario || prontuario),
        procedureId: cleanText(createdService?.id || normalizedService?.id),
        status: 'PENDING',
        failure_layer: 'finance-sync',
        message: err?.message || String(err),
      }));
      console.warn('[PRONTUARIO] procedure_save_failed', JSON.stringify({
        clinicId: getCurrentClinicId(),
        userId: cleanText(currentUserRef?.()?.id),
        prontuario: cleanText(prontuario),
        selected_dentist_id: cleanText(createdService?.dentistaId),
        patient_current_dentist_id: cleanText(patient?.dentistaId),
        selected_procedure_id: cleanText(createdService?.codigo || createdService?.tipo || createdService?.nome),
        failure_layer: 'finance-sync',
        message: err?.message || String(err),
      }));
      return { ...result, financeId, financeCreated, financeWarning: err?.message || 'Falha ao sincronizar financeiro.' };
    }

    try {
      if (isCentralEnabled()) {
        patient = patient || await readPatientWithShadowSync(prontuario);
        await syncProcedureToCentral({
          prontuario,
          patient,
          service: {
            ...syncedService,
            financeiroId: financeId || syncedService.financeiroId || createdService.financeiroId || '',
          },
          stage: 'create-post-shadow',
        });
      }
    } catch (error) {
      if (isCentralEnabled()) logClinicalFallback('add-service-to-patient:post', error);
    }

    return { ...result, service: syncedService, financeId, financeCreated };
  });

  ipcMain.handle('list-all-services', async () => {
    requireRole(['admin']);
    return listAllServices();
  });

  ipcMain.handle('update-service', async (_event, { prontuario, service }) => {
    requireRole(['admin', 'dentista', 'recepcionista']);
    if (!prontuario || !service?.id) {
      return updateService({ prontuario, service });
    }

    let financeId = service.financeiroId || service.financeiroLancamentoId || service?.financeiro?.financeEntryId || '';
    let financeCreated = false;
    let patient = null;

    if (service.status === 'realizado' && service.dataRealizacao) {
      const sourceData = await loadProceduresFromSource(prontuario);
      patient = sourceData.patient;
      const base = (Array.isArray(sourceData.procedures) ? sourceData.procedures : []).find((s) => String(s.id || '') === String(service.id));
      const merged = { ...(base || {}), ...(service || {}) };
      const allowFinance = merged.gerarFinanceiro !== false;
      const baseFinanceId = base?.financeiro?.financeEntryId || base?.financeiroId || base?.financeiroLancamentoId || '';
      const valor = Number(merged.valorCobrado !== undefined ? merged.valorCobrado : (merged.valor || merged.value || 0));
      if (allowFinance && valor > 0) {
        const previousId = financeId || baseFinanceId;
        const wasCreated = !previousId;
        const financeiro = merged.financeiro || {};
        const paymentStatus = normalizePaymentStatus(financeiro.paymentStatus || merged.paymentStatus || 'PENDING');
        const paymentMethod = normalizePaymentMethod(financeiro.paymentMethod || merged.paymentMethod || merged.metodoPagamento || 'PIX');
        const dueDate = financeiro.dueDate || merged.vencimento || '';
        const paidAt = financeiro.paidAt || merged.paidAt || null;
        const lancamento = await upsertProcedureRevenueEntry({
          financeEntryId: previousId,
          procedureId: merged.id || service.id || '',
          patientId: patient.id || patient._id || '',
          prontuario: patient.prontuario || prontuario,
          patientName: patient.fullName || patient.nome || '',
          procedureName: merged.tipo || merged.nome || merged.procedimento || 'Procedimento',
          funcionario: merged.dentistaNome || merged.dentista || '',
          dentistaId: merged.dentistaId || '',
          dentistaNome: merged.dentistaNome || merged.dentista || '',
          descricao: `Procedimento: ${merged.tipo || merged.nome || merged.procedimento || 'Procedimento'}`,
          valor,
          status: paymentStatus,
          paymentMethod,
          dueDate,
          paidAt,
          installments: financeiro.installments ?? null,
          data: toDateOnly(merged.dataRealizacao || new Date().toISOString()),
        });
        financeId = lancamento.id;
        financeCreated = wasCreated;
      }
    }

    const payload = financeId
      ? {
          ...service,
          financeiroId: financeId,
          financeiro: {
            ...(service.financeiro || {}),
            financeEntryId: financeId,
            paymentStatus: normalizePaymentStatus(service?.financeiro?.paymentStatus || service.paymentStatus || 'PENDING'),
            paymentMethod: normalizePaymentMethod(service?.financeiro?.paymentMethod || service.paymentMethod || service.metodoPagamento || 'PIX'),
            paidAt: normalizePaymentStatus(service?.financeiro?.paymentStatus || service.paymentStatus || 'PENDING') === 'PAID'
              ? (service?.financeiro?.paidAt || new Date().toISOString())
              : null,
            dueDate: service?.financeiro?.dueDate || service.vencimento || null,
            installments: service?.financeiro?.installments ?? null,
          },
        }
      : service;
    let result = await updateService({ prontuario, service: payload });

    try {
      const savedService = result?.service || {};
      patient = patient || await readPatient(prontuario);
      const syncIds = await syncProcedureLabCostIntegrations({ patient, service: savedService });
      const currentLabExpenseId = cleanText(savedService?.integracoes?.financeiro?.despesaLaboratorioId);
      const currentLabRegistroId = cleanText(savedService?.integracoes?.laboratorio?.registroId);
      if (syncIds.labExpenseId !== currentLabExpenseId || syncIds.labRegistroId !== currentLabRegistroId) {
        const patchIntegracoes = {
          ...(savedService.integracoes || {}),
          financeiro: {
            ...(savedService?.integracoes?.financeiro || {}),
            despesaLaboratorioId: syncIds.labExpenseId || '',
          },
          laboratorio: {
            ...(savedService?.integracoes?.laboratorio || {}),
            registroId: syncIds.labRegistroId || '',
          },
        };
        result = await updateService({
          prontuario,
          service: {
            id: savedService.id,
            integracoes: patchIntegracoes,
          },
        });
      }
    } catch (err) {
      console.warn('[SERVICOS] falha ao sincronizar custo de laboratorio com financeiro/laboratorio', err);
    }

    try {
      if (isCentralEnabled()) {
        patient = patient || await readPatient(prontuario);
        await syncProcedureToCentral({
          prontuario,
          patient,
          service: result?.service || payload,
          stage: 'update-post-shadow',
        });
      }
    } catch (error) {
      if (isCentralEnabled()) logClinicalFallback('update-service', error);
    }

    return { ...result, financeCreated, financeId };
  });

  ipcMain.handle('service-mark-done', async (_event, payload) => {
    requireRole(['admin', 'dentista']);
    const prontuario = payload?.prontuario || '';
    const serviceId = payload?.serviceId || '';
    if (!prontuario || !serviceId) throw new Error('Prontuario e servico sao obrigatorios.');

    const sourceData = await loadProceduresFromSource(prontuario);
    const patient = sourceData.patient;
    const service = (Array.isArray(sourceData.procedures) ? sourceData.procedures : []).find((s) => String(s.id || '') === String(serviceId));
    if (!service) throw new Error('Servico nao encontrado.');

    const dateISO = payload?.dateISO || new Date().toISOString();
    const doneDate = new Date(dateISO);
    if (Number.isNaN(doneDate.getTime())) throw new Error('Data invalida.');

    let financeId = service.financeiroId || service.financeiroLancamentoId || service?.financeiro?.financeEntryId || '';
    let financeCreated = false;

    const allowFinance = service.gerarFinanceiro !== false;
    const existingFinance = service?.financeiro || {};
    const existingPaymentStatus = normalizePaymentStatus(existingFinance.paymentStatus || service.paymentStatus || 'PENDING');
    const existingPaymentMethod = normalizePaymentMethod(existingFinance.paymentMethod || service.paymentMethod || service.metodoPagamento || 'PIX');
    const existingPaidAt = existingFinance.paidAt || service.paidAt || null;
    const valor = Number(service.valorCobrado !== undefined ? service.valorCobrado : (service.valor || service.value || 0));
    if (allowFinance && valor > 0) {
      const prevId = financeId;
      const lancamento = await upsertProcedureRevenueEntry({
        financeEntryId: prevId,
        procedureId: service.id || '',
        patientId: patient.id || patient._id || '',
        prontuario: patient.prontuario || prontuario,
        patientName: patient.fullName || patient.nome || '',
        procedureName: service.tipo || service.nome || service.procedimento || 'Procedimento',
        descricao: `Procedimento: ${service.tipo || service.nome || service.procedimento || 'Procedimento'}`,
        valor,
        status: existingPaymentStatus,
        paymentMethod: existingPaymentMethod,
        paidAt: existingPaymentStatus === 'PAID' ? existingPaidAt : null,
        data: toDateOnly(doneDate.toISOString()),
      });
      financeId = lancamento.id;
      financeCreated = !prevId;
    }

    const updatePayload = {
      id: serviceId,
      status: 'realizado',
      dataRealizacao: doneDate.toISOString(),
    };
    if (financeId) {
      updatePayload.financeiroId = financeId;
      updatePayload.financeiro = {
        financeEntryId: financeId,
        paymentStatus: existingPaymentStatus,
        paymentMethod: existingPaymentMethod,
        paidAt: existingPaymentStatus === 'PAID' ? (existingPaidAt || new Date().toISOString()) : null,
        dueDate: null,
        installments: null,
      };
    }

    let doneResult = await updateService({ prontuario, service: updatePayload });
    try {
      const savedService = doneResult?.service || {};
      const syncIds = await syncProcedureLabCostIntegrations({ patient, service: savedService });
      const currentLabExpenseId = cleanText(savedService?.integracoes?.financeiro?.despesaLaboratorioId);
      const currentLabRegistroId = cleanText(savedService?.integracoes?.laboratorio?.registroId);
      if (syncIds.labExpenseId !== currentLabExpenseId || syncIds.labRegistroId !== currentLabRegistroId) {
        doneResult = await updateService({
          prontuario,
          service: {
            id: serviceId,
            integracoes: {
              ...(savedService.integracoes || {}),
              financeiro: {
                ...(savedService?.integracoes?.financeiro || {}),
                despesaLaboratorioId: syncIds.labExpenseId || '',
              },
              laboratorio: {
                ...(savedService?.integracoes?.laboratorio || {}),
                registroId: syncIds.labRegistroId || '',
              },
            },
          },
        });
      }
    } catch (err) {
      console.warn('[SERVICOS] falha ao sincronizar laboratorio apos service-mark-done', err);
    }
    return { success: true, financeCreated, financeId, service: doneResult?.service };
  });

  ipcMain.handle('delete-service-record', async (_event, { prontuario, id }) => {
    requireRole(['admin']);
    try {
      if (isCentralEnabled()) {
        const patient = await readPatient(prontuario);
        logCentralActive();
        await centralBackendAdapter.deletePatientProcedure({
          clinicId: getCurrentClinicId(),
          patient: { ...patient, clinicId: getCurrentClinicId() },
          externalId: id,
        });
        console.info('[PRONTUARIO] procedure delete central', JSON.stringify({
          clinicId: getCurrentClinicId(),
          patientId: patient?.id || patient?.prontuario || '',
          procedureId: id,
        }));
      }
    } catch (error) {
      if (isCentralEnabled()) logClinicalFallback('delete-service-record:central', error);
    }
    const result = await deleteServiceRecord({ prontuario, id });
    const removed = result?.removedService || {};
    await deleteProcedureRevenueEntry({
      financeId: removed?.financeiroId || removed?.financeiroLancamentoId || removed?.financeiro?.financeEntryId || '',
      serviceId: removed?.id || id,
    });
    await removeProcedureLaboratorioRecords({
      registroId: removed?.integracoes?.laboratorio?.registroId || '',
      serviceId: removed?.id || id,
      prontuario,
    });
    return result;
  });

  ipcMain.handle('service-add-with-appointment', async (_event, { prontuario, service }) => {
    requireRole(['admin', 'recepcionista']);
    return addServiceWithAppointment({ prontuario, service });
  });

  ipcMain.handle('delete-service', async (_event, { prontuario, serviceId }) => {
    requireRole(['admin']);
    try {
      if (isCentralEnabled()) {
        const patient = await readPatient(prontuario);
        logCentralActive();
        await centralBackendAdapter.deletePatientProcedure({
          clinicId: getCurrentClinicId(),
          patient: { ...patient, clinicId: getCurrentClinicId() },
          externalId: serviceId,
        });
        console.info('[PRONTUARIO] procedure delete central', JSON.stringify({
          clinicId: getCurrentClinicId(),
          patientId: patient?.id || patient?.prontuario || '',
          procedureId: serviceId,
        }));
      }
    } catch (error) {
      if (isCentralEnabled()) logClinicalFallback('delete-service:central', error);
    }
    const result = await deleteService({ prontuario, serviceId });
    const removed = result?.removedService || {};
    await deleteProcedureRevenueEntry({
      financeId: removed?.financeiroId || removed?.financeiroLancamentoId || removed?.financeiro?.financeEntryId || '',
      serviceId: removed?.id || serviceId,
    });
    await removeProcedureLaboratorioRecords({
      registroId: removed?.integracoes?.laboratorio?.registroId || '',
      serviceId: removed?.id || serviceId,
      prontuario,
    });
    return result;
  });

  ipcMain.handle('list-services-for-patient', async (_event, prontuario) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const sourceData = await loadProceduresFromSource(prontuario);
    const patient = sourceData?.patient || {};
    const patientSummary = sourceData?.patientSummary || {};
    const servicos = Array.isArray(sourceData?.procedures) ? sourceData.procedures : [];
    console.info('[PRONTUARIO] procedure_loaded_in_prontuario', JSON.stringify({
      clinicId: getCurrentClinicId(),
      userId: cleanText(currentUserRef?.()?.id),
      patientId: cleanText(patient?.id || patient?.prontuario || prontuario),
      procedureId: '',
      status: '',
      count: servicos.length,
      source: cleanText(sourceData?.source || 'unknown'),
    }));
    return {
      nome: patientSummary?.nome || patient?.fullName || patient?.nome || '',
      cpf: patientSummary?.cpf || patient?.cpf || '',
      prontuario: patientSummary?.prontuario || patient?.prontuario || cleanText(prontuario),
      servicos,
      source: sourceData?.source || 'unknown',
    };
  });

  ipcMain.handle('load-procedures', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return loadProcedures();
  });
};

module.exports = { registerServicesHandlers };
