const registerLaboratorioHandlers = ({
  ipcMain,
  requireRole,
  readLaboratorio,
  writeLaboratorio,
  generateLaboratorioId,
  parseDateOnly,
  isSameMonth,
  currentUserRef,
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
  const logCentral = (action, payload = {}) => {
    console.info('[LABORATORIO]', JSON.stringify({
      action,
      clinicId: getCurrentClinicId(),
      ...payload,
    }));
  };
  const logFallback = (action, error) => {
    console.warn('[LABORATORIO]', JSON.stringify({
      action,
      module: 'laboratorio',
      operation: action,
      clinicId: getCurrentClinicId(),
      laboratory_fallback_to_local: true,
      fallback_triggered: true,
      fallback_reason: error?.message || String(error || ''),
      reason: error?.message || String(error || ''),
    }));
  };
  const shadowUpsert = async (registro = {}) => {
    const list = await readLaboratorio();
    const idx = list.findIndex((item) => String(item?.id || '') === String(registro?.id || ''));
    if (idx >= 0) list[idx] = { ...list[idx], ...registro };
    else list.push(registro);
    await writeLaboratorio(list);
    console.info('[LABORATORIO]', JSON.stringify({
      module: 'laboratorio',
      operation: 'shadow-upsert',
      clinicId: registro?.clinicId || getCurrentClinicId(),
      orderId: registro?.id || '',
      shadow_write_executed: true,
    }));
  };
  const shadowDelete = async (id) => {
    const list = await readLaboratorio();
    const filtered = list.filter((item) => !(String(item?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId() && String(item?.id || '') === String(id || '')));
    if (filtered.length !== list.length) {
      await writeLaboratorio(filtered);
      console.info('[LABORATORIO]', JSON.stringify({
        module: 'laboratorio',
        operation: 'shadow-delete',
        clinicId: getCurrentClinicId(),
        orderId: String(id || '').trim(),
        shadow_write_executed: true,
      }));
    }
  };
  const localDashboard = async () => {
    const list = byClinic(await readLaboratorio());
    const hoje = new Date();
    let totalMes = 0;
    let pendentes = 0;
    list.forEach((r) => {
      const d = parseDateOnly(r.entrada);
      const valor = Number(r.valor) || 0;
      if (d && isSameMonth(d, hoje)) totalMes += valor;
      if ((r.status || 'pendente') !== 'entregue' && (r.status || 'pendente') !== 'cancelado') pendentes += 1;
    });
    const entregues = list.filter((r) => r.status === 'entregue').length;
    return { totalMes, pendentes, entregues, totalPedidos: list.length };
  };

  ipcMain.handle('laboratorio-list', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista']);
    if (isCentralEnabled()) {
      try {
        const patientId = cleanText(payload?.patientId || payload?.prontuario);
        const list = patientId
          ? await centralBackendAdapter.listLaboratoryOrdersByPatient({
              clinicId: getCurrentClinicId(),
              patientId,
            })
          : await centralBackendAdapter.listLaboratoryOrdersByClinic({
              clinicId: getCurrentClinicId(),
            });
        logCentral('laboratory_loaded_from=central', {
          source: 'central',
          patientId,
          count: Array.isArray(list) ? list.length : 0,
        });
        return Array.isArray(list) ? list : [];
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logFallback('laboratorio-list', error);
      }
    }
    const list = byClinic(await readLaboratorio());
    return list.sort((a, b) => String(b?.entrada || '').localeCompare(String(a?.entrada || '')));
  });

  ipcMain.handle('laboratorio-add', async (_event, item) => {
    requireRole(['admin', 'recepcionista']);
    const now = new Date();
    if (isCentralEnabled()) {
      const registro = await centralBackendAdapter.createLaboratoryOrder({
        clinicId: getCurrentClinicId(),
        patient: { id: item?.patientId || item?.prontuario || '' },
        appointment: { id: item?.appointmentId || '' },
        order: {
          patientId: item?.patientId || item?.prontuario || '',
          appointmentId: item?.appointmentId || '',
          procedureId: item?.procedureId || item?.servicoId || '',
          labName: item?.labName || item?.laboratorio || '',
          externalReference: item?.externalReference || '',
          description: item?.description || item?.descricao || item?.peca || '',
          status: item?.status || 'REQUESTED',
          requestedAt: item?.requestedAt || item?.entrada || now.toISOString(),
          expectedAt: item?.expectedAt || item?.saida || null,
          notes: item?.notes || item?.observacoes || '',
          totalCost: item?.totalCost ?? item?.valor ?? 0,
          paciente: item?.paciente || '',
          peca: item?.peca || '',
          prontuario: item?.prontuario || item?.patientId || '',
          financeExpenseId: item?.financeExpenseId || item?.despesaLaboratorioId || '',
          items: Array.isArray(item?.items) ? item.items : [],
        },
      });
      await shadowUpsert(registro);
      logCentral('laboratory_order_created', {
        patientId: registro?.patientId || '',
        orderId: registro?.id || '',
        procedureId: registro?.procedureId || '',
        status: registro?.centralStatus || '',
      });
      return { success: true, registro };
    }

    const list = await readLaboratorio();
    const novo = {
      id: generateLaboratorioId(),
      clinicId: getCurrentClinicId(),
      laboratorio: item?.laboratorio || '',
      paciente: item?.paciente || '',
      peca: item?.peca || '',
      entrada: item?.entrada || now.toISOString().split('T')[0],
      saida: item?.saida || '',
      valor: Number(item?.valor) || 0,
      status: item?.status || 'pendente',
      createdAt: now.toISOString(),
    };
    list.push(novo);
    await writeLaboratorio(list);
    return { success: true, registro: novo };
  });

  ipcMain.handle('laboratorio-update', async (_event, item) => {
    requireRole(['admin', 'recepcionista']);
    if (!item?.id) throw new Error('ID e obrigatorio.');
    if (isCentralEnabled()) {
      const registro = await centralBackendAdapter.updateLaboratoryOrder({
        clinicId: getCurrentClinicId(),
        orderId: item.id,
        order: {
          ...item,
          labName: item?.labName || item?.laboratorio || '',
          description: item?.description || item?.descricao || item?.peca || '',
          expectedAt: item?.expectedAt || item?.saida || null,
          requestedAt: item?.requestedAt || item?.entrada || null,
          notes: item?.notes || item?.observacoes || '',
          totalCost: item?.totalCost ?? item?.valor ?? 0,
        },
      });
      await shadowUpsert(registro);
      logCentral('laboratory_order_updated', {
        patientId: registro?.patientId || '',
        orderId: registro?.id || '',
        procedureId: registro?.procedureId || '',
        status: registro?.centralStatus || '',
      });
      return { success: true, registro };
    }

    const list = await readLaboratorio();
    const idx = list.findIndex((r) => r.id === item.id);
    if (idx === -1) throw new Error('Registro nao encontrado.');
    if (String(list[idx]?.clinicId || DEFAULT_CLINIC_ID) !== getCurrentClinicId()) throw new Error('Acesso negado.');
    list[idx] = { ...list[idx], ...item, clinicId: list[idx].clinicId || getCurrentClinicId(), valor: Number(item.valor) || 0 };
    await writeLaboratorio(list);
    return { success: true, registro: list[idx] };
  });

  ipcMain.handle('laboratorio-delete', async (_event, id) => {
    requireRole(['admin', 'recepcionista']);
    if (!id) throw new Error('ID e obrigatorio.');
    if (isCentralEnabled()) {
      await centralBackendAdapter.deleteLaboratoryOrder({
        clinicId: getCurrentClinicId(),
        orderId: id,
      });
      await shadowDelete(id);
      logCentral('laboratory_order_deleted', { orderId: id });
      return { success: true };
    }

    const list = await readLaboratorio();
    const filtered = list.filter((r) => {
      const sameClinic = String(r?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId();
      return !(sameClinic && r.id === id);
    });
    await writeLaboratorio(filtered);
    return { success: true };
  });

  ipcMain.handle('laboratorio-get-dashboard', async () => {
    requireRole(['admin', 'recepcionista']);
    if (isCentralEnabled()) {
      try {
        const data = await centralBackendAdapter.getLaboratoryDashboardSummary({
          clinicId: getCurrentClinicId(),
        });
        logCentral('laboratory_loaded_from=central', {
          source: 'central',
          summary: true,
        });
        return data;
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logFallback('laboratorio-get-dashboard', error);
      }
    }
    return localDashboard();
  });
};

module.exports = { registerLaboratorioHandlers };
