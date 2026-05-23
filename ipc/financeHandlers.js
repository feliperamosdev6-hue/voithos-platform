const registerFinanceHandlers = ({
  ipcMain,
  shell,
  requireAccess,
  readFinance,
  writeFinance,
  readFinanceClosings,
  writeFinanceClosings,
  buildFinanceMonthlyReport,
  generateFinanceReportPdf,
  currentUserRef,
  updateService,
  centralBackendAdapter,
}) => {
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
  const byClinic = (list = []) => list.filter((item) => String(item?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId());
  const cleanText = (value) => String(value || '').trim();
  const extractProcedureNameFromDescription = (value) => {
    let text = cleanText(value);
    if (!text) return '';
    text = text.replace(/^\[procedimento\]\s*/i, '').trim();
    text = text.replace(/^procedimento:\s*/i, '').trim();
    return text;
  };
  const resolveProcedureLabel = (row = {}) => {
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    return cleanText(
      row?.procedimento
      || row?.procedureName
      || row?.serviceLabel
      || row?.serviceName
      || metadata.procedureName
      || metadata.serviceLabel
      || metadata.serviceName
      || extractProcedureNameFromDescription(row?.descricao || row?.description || metadata.description)
    );
  };
  const resolveProcedureDescription = (row = {}) => {
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const description = cleanText(row?.descricao || row?.description || metadata.description);
    if (description) return description;
    const procedureLabel = resolveProcedureLabel(row);
    return procedureLabel ? `Procedimento: ${procedureLabel}` : '';
  };
  const normalizePaymentStatus = (value) => {
    const raw = cleanText(value).toUpperCase();
    if (raw === 'PENDING' || raw === 'PENDENTE' || raw === 'OPEN' || raw === 'PARTIAL') return 'PENDING';
    if (raw === 'CANCELLED' || raw === 'CANCELED' || raw === 'CANCELADO') return 'CANCELLED';
    if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
    return 'PENDING';
  };
  const normalizePaymentMethod = (value) => {
    const raw = cleanText(value).toUpperCase();
    if (['PIX', 'CREDIT', 'DEBIT', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER'].includes(raw)) return raw;
    if (raw === 'CARD' || raw === 'CARTAO') return 'CREDIT';
    if (raw === 'CARTAO_CREDITO' || raw === 'CREDITO') return 'CREDIT';
    if (raw === 'CARTAO_DEBITO' || raw === 'DEBITO') return 'DEBIT';
    if (raw === 'DINHEIRO') return 'CASH';
    if (raw === 'TRANSFERENCIA') return 'TRANSFER';
    if (raw === 'OUTRO') return 'OTHER';
    return raw || 'PIX';
  };
  const paymentStatusToLegacy = (value) => {
    const upper = normalizePaymentStatus(value);
    if (upper === 'PENDING') return 'pendente';
    if (upper === 'CANCELLED') return 'cancelado';
    return 'pago';
  };
  const paymentMethodToLegacy = (value) => {
    const upper = normalizePaymentMethod(value);
    const map = {
      PIX: 'pix',
      CREDIT: 'cartao_credito',
      DEBIT: 'cartao_debito',
      CARD: 'cartao_credito',
      CASH: 'dinheiro',
      BOLETO: 'boleto',
      TRANSFER: 'transferencia',
      OTHER: 'outro',
    };
    return map[upper] || 'pix';
  };
  const isProcedureFinanceEntry = (entry = {}) => {
    const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    return cleanText(entry?.origem || entry?.source || metadata.origin).toLowerCase() === 'procedimento'
      || cleanText(entry?.categoria || entry?.category || metadata.category).toLowerCase() === 'procedimentos'
      || Boolean(cleanText(entry?.procedureId || entry?.servicoId || entry?.patientProcedureId || metadata.procedureId || metadata.patientProcedureId));
  };
  const hasExplicitFinancialDueDate = (entry = {}) => {
    const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    return entry?.explicitDueDate === true
      || metadata.explicitDueDate === true
      || metadata.hasExplicitDueDate === true
      || cleanText(metadata.dueDateSource).toLowerCase() === 'financial'
      || cleanText(metadata.vencimentoSource).toLowerCase() === 'financial';
  };
  const isEligibleForFinancialReminder = (entry = {}) => (
    !isProcedureFinanceEntry(entry) || hasExplicitFinancialDueDate(entry)
  );
  const normalizeFinanceRow = (row = {}) => {
    const procedureLabel = resolveProcedureLabel(row);
    const description = resolveProcedureDescription(row);
    const paymentStatus = normalizePaymentStatus(row?.paymentStatus || row?.status || 'PENDING');
    const paymentMethod = normalizePaymentMethod(
      row?.paymentMethodDetail
      || row?.metadata?.paymentMethodDetail
      || row?.paymentMethod
      || row?.metodoPagamento
      || '',
    );
    const totalAmount = Number(
      row?.valor ?? row?.totalAmount ?? row?.amount ?? row?.grossAmount ?? 0
    ) || 0;
    const installmentSchedule = Array.isArray(row?.installments)
      ? row.installments
      : (Array.isArray(row?.metadata?.schedule) ? row.metadata.schedule : []);
    const installmentsCount = Math.max(
      1,
      Number(
        row?.installmentsCount
        ?? row?.parcelas
        ?? (Array.isArray(row?.installments) ? row.installments.length : row?.installments)
        ?? row?.metadata?.installmentsCount
        ?? installmentSchedule.length
        ?? 1
      ) || 1,
    );
    const remainingAmount = row?.remainingAmount !== undefined && row?.remainingAmount !== null
      ? (Number(row.remainingAmount) || 0)
      : (paymentStatus === 'PAID' ? 0 : totalAmount);
    return {
      ...row,
      descricao: description,
      description,
      procedimento: procedureLabel,
      procedureName: cleanText(row?.procedureName || procedureLabel),
      valor: totalAmount,
      totalAmount,
      remainingAmount,
      status: paymentStatusToLegacy(paymentStatus),
      paymentStatus,
      paymentMethod,
      metodoPagamento: row?.metodoPagamento || paymentMethodToLegacy(paymentMethod),
      vencimento: row?.vencimento || row?.dueDate || null,
      dueDate: row?.dueDate || row?.vencimento || null,
      paidAt: row?.paidAt || null,
      patientId: cleanText(row?.patientId || row?.prontuario),
      prontuario: cleanText(row?.prontuario || row?.patientId),
      procedureId: cleanText(row?.procedureId || row?.servicoId),
      servicoId: cleanText(row?.servicoId || row?.procedureId),
      installmentSchedule,
      installments: installmentsCount,
      installmentsCount,
    };
  };
  const logCentral = (action, payload = {}) => {
    console.info('[FINANCEIRO]', JSON.stringify({
      action,
      clinicId: getCurrentClinicId(),
      ...payload,
    }));
  };
  const logFallback = (action, error) => {
    console.warn('[FINANCEIRO]', JSON.stringify({
      action,
      module: 'financeiro',
      operation: action,
      clinicId: getCurrentClinicId(),
      financial_fallback_to_local: true,
      fallback_triggered: true,
      fallback_reason: error?.message || String(error || ''),
      reason: error?.message || String(error || ''),
    }));
  };
  const shadowUpsert = async (row = {}) => {
    const normalizedRow = normalizeFinanceRow(row);
    const list = await readFinance();
    const idx = list.findIndex((item) => String(item?.id || '') === String(normalizedRow?.id || ''));
    if (idx >= 0) list[idx] = { ...list[idx], ...normalizedRow, clinicId: normalizedRow.clinicId || getCurrentClinicId() };
    else list.push({ ...normalizedRow, clinicId: normalizedRow.clinicId || getCurrentClinicId() });
    await writeFinance(list);
    console.info('[FINANCEIRO]', JSON.stringify({
      module: 'financeiro',
      operation: 'shadow-upsert',
      clinicId: normalizedRow.clinicId || getCurrentClinicId(),
      accountId: normalizedRow?.id || '',
      shadow_write_executed: true,
    }));
  };
  const shadowDelete = async (id) => {
    const list = await readFinance();
    const filtered = list.filter((item) => !(String(item?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId() && String(item?.id || '') === String(id || '')));
    if (filtered.length !== list.length) {
      await writeFinance(filtered);
      console.info('[FINANCEIRO]', JSON.stringify({
        module: 'financeiro',
        operation: 'shadow-delete',
        clinicId: getCurrentClinicId(),
        accountId: String(id || '').trim(),
        shadow_write_executed: true,
      }));
    }
  };
  const isPlanFinanceRow = (row = {}) => {
    const planId = cleanText(row?.planId || row?.metadata?.planId || '');
    const origem = cleanText(row?.origem || row?.source || row?.metadata?.origin || '').toLowerCase();
    const categoria = cleanText(row?.categoria || row?.category || row?.metadata?.category || '').toLowerCase();
    const descricao = cleanText(row?.descricao || row?.description || '');
    return Boolean(
      planId
      || origem === 'plano'
      || categoria === 'planos'
      || /^\[plano\]/i.test(descricao)
    );
  };
  const runFinanceShadowSync = async (lancamento = {}, { action = 'finance-shadow-sync' } = {}) => {
    try {
      await shadowUpsert(lancamento);
      if (!isPlanFinanceRow(lancamento)) {
        await syncProcedureFinanceSnapshot(lancamento);
      }
    } catch (error) {
      console.warn('[FINANCEIRO]', JSON.stringify({
        action,
        clinicId: getCurrentClinicId(),
        accountId: cleanText(lancamento?.id || ''),
        patientId: cleanText(lancamento?.patientId || lancamento?.prontuario || ''),
        planId: cleanText(lancamento?.planId || lancamento?.metadata?.planId || ''),
        shadow_sync_failed: true,
        message: error?.message || String(error || ''),
      }));
    }
  };
  const syncProcedureFinanceSnapshot = async (lancamento = {}) => {
    const financeRow = normalizeFinanceRow(lancamento);
    const prontuario = cleanText(financeRow?.prontuario);
    const patientId = cleanText(financeRow?.patientId);
    const procedureId = cleanText(financeRow?.procedureId || financeRow?.servicoId);
    const procedureLabel = resolveProcedureLabel(financeRow);
    const description = resolveProcedureDescription(financeRow);
    if (!prontuario || !procedureId || typeof updateService !== 'function') return;
    const servicePatch = {
      id: procedureId,
      financeiroId: financeRow.id,
      paymentStatus: financeRow.paymentStatus || 'PENDING',
      paymentMethod: financeRow.paymentMethod || 'PIX',
      paidAt: financeRow.paidAt || null,
      vencimento: financeRow.dueDate || financeRow.vencimento || null,
      financeiro: {
        financeEntryId: financeRow.id,
        procedureName: procedureLabel,
        serviceLabel: cleanText(financeRow?.serviceLabel || procedureLabel),
        description,
        paymentStatus: financeRow.paymentStatus || 'PENDING',
        paymentMethod: financeRow.paymentMethod || 'PIX',
        paidAt: financeRow.paidAt || null,
        dueDate: financeRow.dueDate || financeRow.vencimento || null,
        installments: financeRow.installments ?? null,
      },
    };
    console.info('[FINANCEIRO]', JSON.stringify({
      action: 'procedure_financial_sync_started',
      clinicId: getCurrentClinicId(),
      patientId,
      procedureId,
      financeId: financeRow.id || '',
      status: financeRow.paymentStatus || 'PENDING',
      failure_layer: '',
    }));
    try {
      const updateResult = await updateService({
        prontuario,
        service: servicePatch,
      });

      if (isCentralEnabled()) {
        const patientRef = {
          id: patientId || prontuario,
          prontuario,
          clinicId: getCurrentClinicId(),
        };
        const centralProcedures = await centralBackendAdapter.listPatientProcedures({
          clinicId: getCurrentClinicId(),
          patient: patientRef,
        });
        const baseProcedure = (Array.isArray(centralProcedures) ? centralProcedures : [])
          .find((item) => cleanText(item?.id) === procedureId);
        await centralBackendAdapter.upsertPatientProcedure({
          clinicId: getCurrentClinicId(),
          patient: patientRef,
          procedure: {
            ...(baseProcedure || {}),
            ...(updateResult?.service || {}),
            ...servicePatch,
            id: procedureId,
            patientProntuario: prontuario,
          },
        });
      }

      console.info('[FINANCEIRO]', JSON.stringify({
        action: 'procedure_financial_sync_completed',
        clinicId: getCurrentClinicId(),
        patientId,
        procedureId,
        financeId: financeRow.id || '',
        status: financeRow.paymentStatus || 'PENDING',
        failure_layer: '',
      }));
    } catch (error) {
      console.warn('[FINANCEIRO]', JSON.stringify({
        action: 'procedure_financial_sync_failed',
        clinicId: getCurrentClinicId(),
        patientId,
        procedureId,
        financeId: financeRow.id || '',
        status: financeRow.paymentStatus || 'PENDING',
        failure_layer: 'procedure-finance-sync',
        message: error?.message || String(error || ''),
      }));
      throw error;
    }
  };
  const loadCentralList = async ({ patientId = '', prontuario = '' } = {}) => {
    if (!isCentralEnabled()) {
      return null;
    }
    const list = await centralBackendAdapter.listFinancialAccounts({
      clinicId: getCurrentClinicId(),
      patientId,
    });
    logCentral('financial_loaded_from=central', {
      source: 'central',
      patientId,
      prontuario,
      count: Array.isArray(list) ? list.length : 0,
    });
    return Array.isArray(list) ? list.map((item) => normalizeFinanceRow(item)) : [];
  };
  const loadFinanceList = async ({ patientId = '', prontuario = '' } = {}) => {
    const patientKey = cleanText(patientId);
    const prontuarioKey = cleanText(prontuario);
    try {
      const centralPatientId = patientKey || '';
      const central = await loadCentralList({ patientId: centralPatientId, prontuario: prontuarioKey });
      if (central) {
        if (!patientKey && !prontuarioKey) return central;
        return central.filter((item) => {
          if (patientKey && cleanText(item?.patientId) === patientKey) return true;
          if (prontuarioKey && cleanText(item?.prontuario) === prontuarioKey) return true;
          return false;
        });
      }
    } catch (error) {
      if (!shouldFallbackToLocal(error)) throw error;
      logFallback('finance-read', error);
    }
    const list = byClinic(await readFinance()).map((item) => normalizeFinanceRow(item));
    if (!patientKey && !prontuarioKey) return list;
    return list.filter((item) => {
      if (patientKey && cleanText(item?.patientId) === patientKey) return true;
      if (prontuarioKey && cleanText(item?.prontuario) === prontuarioKey) return true;
      return false;
    });
  };
  const reconcileProcedureFinanceByClinic = async ({ clinicId = '', dryRun = true } = {}) => {
    if (!isCentralEnabled()) throw new Error('Financeiro central indisponivel.');

    const targetClinicId = cleanText(clinicId || getCurrentClinicId());
    if (!targetClinicId) throw new Error('clinicId e obrigatorio.');

    const normalizeProcedureFinanceLink = (row = {}) => cleanText(
      row?.procedureId || row?.servicoId || row?.externalReference
    );

    const patients = await centralBackendAdapter.getPatients({ clinicId: targetClinicId });
    const patientRefs = (Array.isArray(patients) ? patients : [])
      .map((patient) => ({
        id: cleanText(patient?.id || patient?.prontuario),
        prontuario: cleanText(patient?.prontuario || patient?.id),
        nome: cleanText(patient?.nome || patient?.fullName),
        clinicId: targetClinicId,
      }))
      .filter((patient) => patient.id && patient.prontuario);

    const proceduresById = new Map();
    for (const patient of patientRefs) {
      const procedures = await centralBackendAdapter.listPatientProcedures({
        clinicId: targetClinicId,
        patient,
      }).catch(() => []);
      (Array.isArray(procedures) ? procedures : []).forEach((procedure) => {
        const procedureId = cleanText(procedure?.id);
        if (!procedureId) return;
        proceduresById.set(procedureId, { procedure, patient });
      });
    }

    const accounts = await centralBackendAdapter.listFinancialAccounts({ clinicId: targetClinicId });
    const financeByProcedure = new Map();
    (Array.isArray(accounts) ? accounts : []).forEach((row) => {
      const normalized = normalizeFinanceRow(row);
      const procedureId = normalizeProcedureFinanceLink(normalized);
      if (!procedureId) return;
      const list = financeByProcedure.get(procedureId) || [];
      list.push(normalized);
      financeByProcedure.set(procedureId, list);
    });

    const report = {
      clinicId: targetClinicId,
      dryRun: dryRun !== false,
      patientCount: patientRefs.length,
      procedureCount: proceduresById.size,
      financeProcedureCount: Array.from(financeByProcedure.values()).reduce((acc, list) => acc + list.length, 0),
      missingFinance: [],
      extraFinance: [],
      duplicateFinance: [],
      relinkedProcedures: [],
      createdFinance: [],
      deletedFinance: [],
    };

    for (const [procedureId, context] of proceduresById.entries()) {
      const rows = financeByProcedure.get(procedureId) || [];
      if (!rows.length) {
        report.missingFinance.push({
          procedureId,
          patientId: context.patient.id,
          prontuario: context.patient.prontuario,
          procedureName: cleanText(context.procedure?.tipo || context.procedure?.nome || context.procedure?.procedimento),
        });
        continue;
      }
      if (rows.length > 1) {
        report.duplicateFinance.push({
          procedureId,
          financeIds: rows.map((row) => cleanText(row?.id)),
        });
      }
      const currentFinanceId = cleanText(context.procedure?.financeiroId || context.procedure?.financeiro?.financeEntryId);
      if (!currentFinanceId || !rows.some((row) => cleanText(row?.id) === currentFinanceId)) {
        report.relinkedProcedures.push({
          procedureId,
          previousFinanceId: currentFinanceId,
          nextFinanceId: cleanText(rows[0]?.id),
        });
      }
    }

    for (const [procedureId, rows] of financeByProcedure.entries()) {
      if (!proceduresById.has(procedureId)) {
        report.extraFinance.push({
          procedureId,
          financeIds: rows.map((row) => cleanText(row?.id)),
        });
      }
    }

    if (dryRun !== false) {
      console.info('[FINANCEIRO]', JSON.stringify({
        action: 'finance_reconcile_clinic_audit',
        clinicId: targetClinicId,
        metric_semantics: 'procedure-finance-1to1',
        missingFinance: report.missingFinance.length,
        extraFinance: report.extraFinance.length,
        duplicateFinance: report.duplicateFinance.length,
        relinkedProcedures: report.relinkedProcedures.length,
      }));
      return report;
    }

    for (const extra of report.extraFinance) {
      for (const financeId of extra.financeIds) {
        await centralBackendAdapter.deleteFinancialAccount({
          clinicId: targetClinicId,
          accountId: financeId,
        });
        report.deletedFinance.push(financeId);
      }
    }

    for (const duplicate of report.duplicateFinance) {
      const context = proceduresById.get(duplicate.procedureId);
      const rows = financeByProcedure.get(duplicate.procedureId) || [];
      const currentFinanceId = cleanText(context?.procedure?.financeiroId || context?.procedure?.financeiro?.financeEntryId);
      const canonical = rows.find((row) => cleanText(row?.id) === currentFinanceId) || rows[0];
      for (const row of rows) {
        const financeId = cleanText(row?.id);
        if (!financeId || financeId === cleanText(canonical?.id)) continue;
        await centralBackendAdapter.deleteFinancialAccount({
          clinicId: targetClinicId,
          accountId: financeId,
        });
        report.deletedFinance.push(financeId);
      }
      financeByProcedure.set(duplicate.procedureId, [canonical]);
    }

    for (const missing of report.missingFinance) {
      const context = proceduresById.get(missing.procedureId);
      if (!context) continue;
      const procedure = context.procedure || {};
      const amount = Number(procedure?.valorCobrado ?? procedure?.valor ?? procedure?.value ?? 0) || 0;
      if (amount <= 0 || procedure?.gerarFinanceiro === false) continue;
      const procedureLabel = resolveProcedureLabel(procedure) || 'Procedimento';
      const description = resolveProcedureDescription({
        ...procedure,
        procedimento: procedureLabel,
        descricao: procedure?.financeiro?.description || procedure?.descricao || '',
      }) || `Procedimento: ${procedureLabel}`;
      const created = await centralBackendAdapter.createFinancialAccount({
        clinicId: targetClinicId,
        patient: context.patient,
        account: {
          patientId: context.patient.id,
          description,
          totalAmount: amount,
          category: 'procedimentos',
          source: 'procedimento',
          type: 'receita',
          paymentMethod: normalizePaymentMethod(procedure?.financeiro?.paymentMethod || procedure?.paymentMethod || procedure?.metodoPagamento || 'PIX'),
          dueDate: procedure?.financeiro?.dueDate || procedure?.financeiro?.vencimento || procedure?.vencimento || null,
          explicitDueDate: Boolean(procedure?.financeiro?.dueDate || procedure?.financeiro?.vencimento || procedure?.vencimento),
          installments: procedure?.financeiro?.installments ?? null,
          procedureId: missing.procedureId,
          patientName: context.patient.nome || '',
          procedureName: procedureLabel,
          funcionario: procedure?.dentistaNome || procedure?.dentista || '',
          dentistaId: procedure?.dentistaId || '',
          dentistaNome: procedure?.dentistaNome || procedure?.dentista || '',
          prontuario: context.patient.prontuario,
          externalReference: missing.procedureId,
          metadata: {
            ...(procedure?.financeiro?.metadata && typeof procedure.financeiro.metadata === 'object' ? procedure.financeiro.metadata : {}),
            patientName: context.patient.nome || '',
            prontuario: context.patient.prontuario,
            procedureId: missing.procedureId,
            procedureName: procedureLabel,
            serviceLabel: procedureLabel,
            description,
            category: 'procedimentos',
            origin: 'procedimento',
            type: 'receita',
          },
        },
      });
      const normalizedCreated = normalizeFinanceRow(created);
      financeByProcedure.set(missing.procedureId, [normalizedCreated]);
      report.createdFinance.push(cleanText(normalizedCreated?.id));
    }

    const proceduresToRelink = new Set([
      ...report.relinkedProcedures.map((item) => item.procedureId),
      ...report.missingFinance.map((item) => item.procedureId),
    ]);

    for (const procedureId of proceduresToRelink) {
      const context = proceduresById.get(procedureId);
      const canonical = (financeByProcedure.get(procedureId) || [])[0];
      if (!context || !canonical) continue;
      const procedure = context.procedure || {};
      const paymentStatus = normalizePaymentStatus(canonical?.paymentStatus || canonical?.status || procedure?.paymentStatus || procedure?.financeiro?.paymentStatus || 'PENDING');
      const paymentMethod = normalizePaymentMethod(canonical?.paymentMethod || canonical?.metodoPagamento || procedure?.paymentMethod || procedure?.financeiro?.paymentMethod || 'PIX');
      await centralBackendAdapter.upsertPatientProcedure({
        clinicId: targetClinicId,
        patient: context.patient,
        procedure: {
          ...procedure,
          id: procedureId,
          patientProntuario: context.patient.prontuario,
          financeiroId: cleanText(canonical?.id),
          paymentStatus,
          paymentMethod,
          paidAt: paymentStatus === 'PAID' ? (canonical?.paidAt || procedure?.paidAt || null) : null,
          vencimento: canonical?.dueDate || canonical?.vencimento || procedure?.vencimento || null,
          financeiro: {
            ...(procedure?.financeiro || {}),
            financeEntryId: cleanText(canonical?.id),
            paymentStatus,
            paymentMethod,
            paidAt: paymentStatus === 'PAID' ? (canonical?.paidAt || procedure?.paidAt || null) : null,
            dueDate: canonical?.dueDate || canonical?.vencimento || procedure?.vencimento || null,
            installments: canonical?.installments ?? procedure?.financeiro?.installments ?? null,
          },
        },
      });
    }

    const centralAfter = await centralBackendAdapter.listFinancialAccounts({ clinicId: targetClinicId });
    const normalizedCentralAfter = (Array.isArray(centralAfter) ? centralAfter : [])
      .map((row) => normalizeFinanceRow(row))
      .filter((row) => normalizeProcedureFinanceLink(row));
    const localAll = await readFinance();
    const localWithoutClinicProcedureEntries = (Array.isArray(localAll) ? localAll : []).filter((item) => {
      const sameClinic = String(item?.clinicId || DEFAULT_CLINIC_ID) === targetClinicId;
      const hasProcedureLink = normalizeProcedureFinanceLink(item);
      return !(sameClinic && hasProcedureLink);
    });
    await writeFinance(localWithoutClinicProcedureEntries.concat(
      normalizedCentralAfter.map((row) => ({ ...row, clinicId: row?.clinicId || targetClinicId }))
    ));

    console.info('[FINANCEIRO]', JSON.stringify({
      action: 'finance_reconcile_clinic_fix',
      clinicId: targetClinicId,
      metric_semantics: 'procedure-finance-1to1',
      missingFinance: report.missingFinance.length,
      extraFinance: report.extraFinance.length,
      duplicateFinance: report.duplicateFinance.length,
      relinkedProcedures: proceduresToRelink.size,
      createdFinance: report.createdFinance.length,
      deletedFinance: report.deletedFinance.length,
    }));

    return {
      ...report,
      dryRun: false,
    };
  };

  const parseReminderDate = (value) => {
    const raw = cleanText(value);
    if (!raw) return null;
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const reminderDiffDays = (targetDate, now) => {
    const left = Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate());
    const right = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((left - right) / 86400000);
  };

  const makeReminderGroup = (items = []) => ({
    count: items.length,
    totalAmount: Math.round(items.reduce((acc, item) => acc + (Number(item?.remainingAmount || 0)), 0) * 100) / 100,
    items: items.slice(0, 5),
  });

  const buildLocalReminders = (entries = []) => {
    const now = new Date();
    const receitas = (Array.isArray(entries) ? entries : [])
      .filter((item) => String(item?.tipo || '').toLowerCase() === 'receita')
      .filter((item) => isEligibleForFinancialReminder(item));
    const overdue = [];
    const dueToday = [];
    const dueSoon = [];
    const partialOutstanding = [];

    receitas.forEach((entry) => {
      const accountId = cleanText(entry?.id);
      const patientId = cleanText(entry?.patientId || entry?.prontuario);
      const patientName = cleanText(entry?.paciente);
      const description = cleanText(entry?.descricao);
      const planId = cleanText(entry?.metadata?.planId || '');
      const externalReference = cleanText(entry?.externalReference || '');
      const accountStatus = cleanText(entry?.paymentStatus || entry?.status).toUpperCase();
      const totalRemaining = Number(entry?.remainingAmount || 0);

      (Array.isArray(entry?.installments) ? entry.installments : []).forEach((installment) => {
        const remainingAmount = Number(installment?.remainingAmount ?? installment?.amount ?? 0);
        if (remainingAmount <= 0) return;
        const installmentStatus = cleanText(installment?.status).toUpperCase();
        if (installmentStatus === 'PAID' || installmentStatus === 'CANCELED') return;
        const due = parseReminderDate(installment?.dueDate);
        if (!due) return;
        const item = {
          type: 'overdue',
          accountId,
          patientId,
          patientName,
          description,
          dueDate: cleanText(installment?.dueDate),
          remainingAmount,
          status: installmentStatus,
          planId,
          externalReference,
        };
        const diffDays = reminderDiffDays(due, now);
        if (diffDays < 0 || installmentStatus === 'OVERDUE') {
          item.type = 'overdue';
          overdue.push(item);
        } else if (diffDays === 0) {
          item.type = 'dueToday';
          dueToday.push(item);
        } else if (diffDays > 0 && diffDays <= 3) {
          item.type = 'dueSoon';
          dueSoon.push(item);
        }
      });

      if (accountStatus === 'PARTIAL' && totalRemaining > 0) {
        partialOutstanding.push({
          type: 'partialOutstanding',
          accountId,
          patientId,
          patientName,
          description,
          dueDate: cleanText(entry?.dueDate || entry?.vencimento),
          remainingAmount: totalRemaining,
          status: accountStatus,
          planId,
          externalReference,
        });
      }
    });

    overdue.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    dueToday.sort((a, b) => String(a.patientName || '').localeCompare(String(b.patientName || '')));
    dueSoon.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    partialOutstanding.sort((a, b) => Number(b.remainingAmount || 0) - Number(a.remainingAmount || 0));

    return {
      clinicId: getCurrentClinicId(),
      generatedAt: new Date().toISOString(),
      overdue: makeReminderGroup(overdue),
      dueToday: makeReminderGroup(dueToday),
      dueSoon: makeReminderGroup(dueSoon),
      partialOutstanding: makeReminderGroup(partialOutstanding),
    };
  };

  ipcMain.handle('finance-list', async () => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    const list = await loadFinanceList();
    return list.sort((a, b) => String(b?.data || '').localeCompare(String(a?.data || '')));
  });

  ipcMain.handle('finance-add', async (_event, lanc) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    if (!isCentralEnabled()) throw new Error('Financeiro central indisponivel.');
    const procedureLabel = resolveProcedureLabel(lanc);
    const description = resolveProcedureDescription(lanc);
    const lancamento = await centralBackendAdapter.createFinancialAccount({
      clinicId: getCurrentClinicId(),
      patient: { id: lanc?.patientId || lanc?.prontuario || '' },
      account: {
        patientId: lanc?.patientId || lanc?.prontuario || '',
        description,
        totalAmount: lanc?.valor || 0,
        category: lanc?.categoria || 'outros',
        source: lanc?.origem || null,
        type: lanc?.tipo || 'receita',
        paymentMethod: lanc?.paymentMethod || lanc?.metodoPagamento || '',
        paymentMethodDetail: lanc?.paymentMethodDetail || lanc?.paymentMethod || lanc?.metodoPagamento || '',
        dueDate: lanc?.dueDate || lanc?.vencimento || lanc?.data || null,
        installments: Array.isArray(lanc?.installments) ? lanc.installments : null,
        installmentsCount: lanc?.installments ?? lanc?.parcelas ?? null,
        procedureId: lanc?.procedureId || lanc?.servicoId || '',
        appointmentId: lanc?.appointmentId || '',
        patientName: lanc?.paciente || '',
        procedureName: procedureLabel,
        serviceLabel: procedureLabel,
        prontuario: lanc?.prontuario || lanc?.patientId || '',
        metadata: {
          ...(lanc?.metadata && typeof lanc.metadata === 'object' ? lanc.metadata : {}),
          description,
          procedureName: procedureLabel,
          serviceLabel: procedureLabel,
          legacyShadow: true,
        },
      },
    });
    await shadowUpsert(lancamento);
    logCentral('financial_created', {
      accountId: lancamento?.id || '',
      patientId: lancamento?.patientId || '',
    });
    return { success: true, lancamento };
  });

  ipcMain.handle('finance-update', async (_event, lanc) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    if (!isCentralEnabled()) throw new Error('Financeiro central indisponivel.');
    if (!lanc?.id) throw new Error('ID do lancamento e obrigatorio.');
    const procedureLabel = resolveProcedureLabel(lanc);
    const description = resolveProcedureDescription(lanc);
    const lancamento = await centralBackendAdapter.updateFinancialAccount({
      clinicId: getCurrentClinicId(),
      accountId: lanc.id,
      account: {
        ...lanc,
        totalAmount: lanc.valor,
        description,
        category: lanc.categoria,
        source: lanc.origem,
        dueDate: lanc.dueDate || lanc.vencimento || lanc.data || null,
        paymentMethodDetail: lanc?.paymentMethodDetail || lanc?.paymentMethod || lanc?.metodoPagamento || '',
        procedureName: procedureLabel,
        serviceLabel: procedureLabel,
        metadata: {
          ...(lanc?.metadata && typeof lanc.metadata === 'object' ? lanc.metadata : {}),
          description,
          procedureName: procedureLabel,
          serviceLabel: procedureLabel,
        },
      },
    });
    await runFinanceShadowSync(lancamento, { action: 'financial_updated_shadow_sync' });
    return { success: true, lancamento };
  });

  ipcMain.handle('finance-procedure-revenue-upsert', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    if (!isCentralEnabled()) throw new Error('Financeiro central indisponivel.');
    const procedureLabel = resolveProcedureLabel(payload) || 'Procedimento';
    const description = resolveProcedureDescription({
      ...payload,
      procedimento: procedureLabel,
      descricao: payload?.descricao || payload?.description || '',
    }) || `Procedimento: ${procedureLabel}`;
    const lancamento = await centralBackendAdapter.createFinancialAccount({
      clinicId: getCurrentClinicId(),
      patient: { id: payload?.patientId || payload?.prontuario || '' },
      account: {
        patientId: payload?.patientId || payload?.prontuario || '',
        description,
        totalAmount: payload?.valor || 0,
        source: 'procedimento',
        category: 'procedimentos',
        type: 'receita',
        paymentMethod: payload?.paymentMethod || payload?.metodoPagamento || '',
        paymentMethodDetail: payload?.paymentMethodDetail || payload?.paymentMethod || payload?.metodoPagamento || '',
        dueDate: payload?.dueDate || payload?.vencimento || null,
        explicitDueDate: Boolean(payload?.dueDate || payload?.vencimento),
        installments: payload?.installments ?? null,
        procedureId: payload?.procedureId || '',
        appointmentId: payload?.appointmentId || '',
        patientName: payload?.patientName || '',
        procedureName: procedureLabel,
        serviceLabel: procedureLabel,
        prontuario: payload?.prontuario || payload?.patientId || '',
        externalReference: payload?.procedureId || payload?.financeEntryId || '',
        metadata: {
          ...(payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
          patientName: payload?.patientName || '',
          prontuario: payload?.prontuario || payload?.patientId || '',
          procedureId: payload?.procedureId || '',
          procedureName: procedureLabel,
          serviceLabel: procedureLabel,
          description,
          category: 'procedimentos',
          origin: 'procedimento',
          type: 'receita',
        },
      },
    });
    await shadowUpsert(lancamento);
    logCentral('financial_created', {
      accountId: lancamento?.id || '',
      patientId: lancamento?.patientId || '',
    });
    return { success: true, lancamento };
  });

  ipcMain.handle('finance-list-by-patient', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    const patientId = cleanText(payload?.patientId);
    const prontuario = cleanText(payload?.prontuario);
    if (!patientId && !prontuario) return [];
    return loadFinanceList({ patientId, prontuario });
  });

  ipcMain.handle('finance-confirm-payment', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    if (!isCentralEnabled()) throw new Error('Financeiro central indisponivel.');
    const accountId = cleanText(payload?.id || payload?.financeEntryId || payload?.accountId);
    if (!accountId) throw new Error('financeEntryId e obrigatorio.');
    const lancamento = await centralBackendAdapter.registerFinancialPayment({
      clinicId: getCurrentClinicId(),
      accountId,
      installmentId: payload?.installmentId || '',
      amount: payload?.amount || payload?.valor || 0,
      method: payload?.paymentMethod || payload?.metodoPagamento || '',
      paymentMethodDetail: payload?.paymentMethodDetail || payload?.paymentMethod || payload?.metodoPagamento || '',
      paidAt: payload?.paidAt || new Date().toISOString(),
      metadata: { source: 'finance-confirm-payment' },
    });

    await runFinanceShadowSync(lancamento, { action: 'payment_registered_shadow_sync' });
    logCentral('payment_registered', {
      accountId: lancamento?.id || '',
      patientId: lancamento?.patientId || '',
    });
    return { success: true, lancamento };
  });

  ipcMain.handle('finance-apply-patient-payment', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    if (!isCentralEnabled()) throw new Error('Financeiro central indisponivel.');
    const patientId = cleanText(payload?.patientId || payload?.prontuario);
    if (!patientId) throw new Error('patientId e obrigatorio.');
    const result = await centralBackendAdapter.applyPatientFinancialPayment({
      clinicId: getCurrentClinicId(),
      patientId,
      amount: payload?.amount || payload?.valor || 0,
      method: payload?.paymentMethod || payload?.metodoPagamento || '',
      paymentMethodDetail: payload?.paymentMethodDetail || payload?.paymentMethod || payload?.metodoPagamento || '',
      paidAt: payload?.paidAt || new Date().toISOString(),
      description: payload?.description || payload?.descricao || '',
      metadata: payload?.metadata || {},
    });
    const accounts = Array.isArray(result?.summary?.accounts) ? result.summary.accounts : [];
    for (const account of accounts) {
      await runFinanceShadowSync(account, { action: 'patient_payment_applied_shadow_sync' });
    }
    logCentral('patient_payment_applied', {
      patientId,
      appliedAmount: result?.appliedAmount || 0,
      excessAmount: result?.excessAmount || 0,
    });
    return { success: true, result };
  });

  ipcMain.handle('finance-delete', async (_event, id) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    if (!id) throw new Error('ID e obrigatorio.');
    if (!isCentralEnabled()) throw new Error('Financeiro central indisponivel.');
    await centralBackendAdapter.deleteFinancialAccount({
      clinicId: getCurrentClinicId(),
      accountId: id,
    });
    await shadowDelete(id);
    return { success: true };
  });

  ipcMain.handle('finance-get-dashboard', async () => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    if (isCentralEnabled()) {
      try {
        const now = new Date();
        const summary = await centralBackendAdapter.getMonthlyFinancialSummary({
          clinicId: getCurrentClinicId(),
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        });
        logCentral('financial_summary_loaded', {
          period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
          financial_source: 'central',
        });
        const dashboard = await centralBackendAdapter.getFinancialDashboard({
          clinicId: getCurrentClinicId(),
        });
        return {
          ...dashboard,
          monthlySummary: summary,
        };
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logFallback('finance-dashboard', error);
      }
    }
    const list = byClinic(await readFinance());
    const report = buildFinanceMonthlyReport(list, new Date().getMonth() + 1, new Date().getFullYear());
    return {
      totalAccounts: list.length,
      totalOpenAmount: report.totalSaidas || 0,
      totalPaidAmount: report.totalEntradas || 0,
      overdueInstallments: 0,
      accounts: list,
    };
  });

  ipcMain.handle('finance-get-reminders', async () => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    const startedAt = Date.now();
    if (isCentralEnabled()) {
      try {
        const reminders = await centralBackendAdapter.getFinancialReminders({
          clinicId: getCurrentClinicId(),
        });
        logCentral('financial_reminders_loaded', {
          financial_reminders_source: 'central',
          durationMs: Date.now() - startedAt,
          counts: {
            overdue: reminders?.overdue?.count || 0,
            dueToday: reminders?.dueToday?.count || 0,
            dueSoon: reminders?.dueSoon?.count || 0,
            partialOutstanding: reminders?.partialOutstanding?.count || 0,
          },
        });
        return reminders;
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        console.warn('[FINANCEIRO]', JSON.stringify({
          action: 'financial_reminders_loaded',
          module: 'financeiro',
          operation: 'finance-get-reminders',
          clinicId: getCurrentClinicId(),
          financial_reminders_fallback_to_local: true,
          fallback_triggered: true,
          fallback_reason: error?.message || String(error || ''),
          durationMs: Date.now() - startedAt,
        }));
      }
    }

    const list = await loadFinanceList();
    return buildLocalReminders(list);
  });

  ipcMain.handle('finance-generate-report-pdf', async (_event, payload) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    const mes = Number(payload?.mes);
    const ano = Number(payload?.ano);
    if (!mes || !ano) throw new Error('Mes e ano sao obrigatorios.');
    const { pdfPath } = await generateFinanceReportPdf(mes, ano, getCurrentClinicId());
    await shell.openPath(pdfPath);
    return { success: true, pdfPath };
  });

  ipcMain.handle('finance-close-month', async (_event, payload) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    const mes = Number(payload?.mes);
    const ano = Number(payload?.ano);
    if (!mes || !ano) throw new Error('Mes e ano sao obrigatorios.');

    if (isCentralEnabled()) {
      try {
        const fechamento = await centralBackendAdapter.closeFinancialMonth({
          clinicId: getCurrentClinicId(),
          month: mes,
          year: ano,
        });
        logCentral('financial_summary_loaded', {
          period: `${ano}-${String(mes).padStart(2, '0')}`,
          financial_source: 'central',
          snapshotId: fechamento?.id || '',
        });
        return { success: true, fechamento };
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logFallback('finance-close-month', error);
      }
    }

    const list = await loadFinanceList();
    const report = buildFinanceMonthlyReport(list, mes, ano);
    const fechamentos = await readFinanceClosings();
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;
    const existente = fechamentos.find((f) => f.chave === chave && String(f?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId());
    if (existente) throw new Error('Fechamento do mes ja existe.');

    const registro = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      clinicId: getCurrentClinicId(),
      chave,
      mes,
      ano,
      totalEntradas: report.totalEntradas,
      totalSaidas: report.totalSaidas,
      saldo: report.saldo,
      entradas: report.entradas,
      saidas: report.saidas,
      createdAt: new Date().toISOString(),
      source: isCentralEnabled() ? 'central' : 'local',
    };

    fechamentos.push(registro);
    await writeFinanceClosings(fechamentos);
    return { success: true, fechamento: registro };
  });

  ipcMain.handle('finance-reconcile-clinic', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    return reconcileProcedureFinanceByClinic({
      clinicId: cleanText(payload?.clinicId || ''),
      dryRun: payload?.dryRun !== false,
    });
  });
};

module.exports = { registerFinanceHandlers };
