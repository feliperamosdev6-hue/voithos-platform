const registerFaturamentoHandlers = ({
  ipcMain,
  requireAccess,
  readFaturamento,
  writeFaturamento,
  buildFaturamentoRecord,
  filterFaturamentoByPeriod,
  computeFaturamentoDashboard,
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
  const fallback = async (action, fn, error) => {
    if (error) {
      console.warn('[FATURAMENTO]', JSON.stringify({
        action,
        module: 'faturamento',
        operation: action,
        clinicId: getCurrentClinicId(),
        financial_fallback_to_local: true,
        fallback_triggered: true,
        fallback_reason: error?.message || String(error || ''),
        reason: error?.message || String(error || ''),
      }));
    }
    return fn();
  };

  const loadCentral = async (period) => {
    const list = await centralBackendAdapter.listFaturamento({
      clinicId: getCurrentClinicId(),
      period,
    });
    console.info('[FATURAMENTO]', JSON.stringify({
      clinicId: getCurrentClinicId(),
      financial_loaded_from: 'central',
      period,
      count: Array.isArray(list) ? list.length : 0,
    }));
    return list;
  };

  ipcMain.handle('faturamento-list-dia', async () => {
    requireAccess({ roles: ['admin'], perms: ['finance.view'] });
    if (isCentralEnabled()) {
      try {
        return await loadCentral('dia');
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        return fallback('faturamento-list-dia', async () => filterFaturamentoByPeriod(byClinic(await readFaturamento()), 'dia'), error);
      }
    }
    return filterFaturamentoByPeriod(byClinic(await readFaturamento()), 'dia');
  });

  ipcMain.handle('faturamento-list-semana', async () => {
    requireAccess({ roles: ['admin'], perms: ['finance.view'] });
    if (isCentralEnabled()) {
      try {
        return await loadCentral('semana');
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        return fallback('faturamento-list-semana', async () => filterFaturamentoByPeriod(byClinic(await readFaturamento()), 'semana'), error);
      }
    }
    return filterFaturamentoByPeriod(byClinic(await readFaturamento()), 'semana');
  });

  ipcMain.handle('faturamento-list-mes', async () => {
    requireAccess({ roles: ['admin'], perms: ['finance.view'] });
    if (isCentralEnabled()) {
      try {
        return await loadCentral('mes');
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        return fallback('faturamento-list-mes', async () => filterFaturamentoByPeriod(byClinic(await readFaturamento()), 'mes'), error);
      }
    }
    return filterFaturamentoByPeriod(byClinic(await readFaturamento()), 'mes');
  });

  ipcMain.handle('faturamento-add', async (_event, lanc) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    if (!isCentralEnabled()) {
      const list = await readFaturamento();
      const novo = {
        ...buildFaturamentoRecord(lanc || {}),
        clinicId: getCurrentClinicId(),
      };
      list.push(novo);
      await writeFaturamento(list);
      return novo;
    }
    const created = await centralBackendAdapter.createFinancialAccount({
      clinicId: getCurrentClinicId(),
      patient: { id: lanc?.patientId || lanc?.prontuario || '' },
      account: {
        patientId: lanc?.patientId || lanc?.prontuario || '',
        description: lanc?.descricao || '',
        totalAmount: lanc?.valor || 0,
        category: lanc?.categoria || 'faturamento',
        source: 'faturamento',
        type: lanc?.tipo || 'receita',
        paymentMethod: lanc?.paymentMethod || lanc?.metodoPagamento || '',
        paymentMethodDetail: lanc?.paymentMethodDetail || lanc?.paymentMethod || lanc?.metodoPagamento || '',
        dueDate: lanc?.data || lanc?.dueDate || null,
        installments: Array.isArray(lanc?.parcelas?.lista)
          ? lanc.parcelas.lista.map((item, index) => ({
              sequence: index + 1,
              dueDate: item?.vencimento || item?.dueDate || lanc?.data || new Date().toISOString(),
              amount: item?.valor || item?.amount || 0,
              status: item?.status === 'pago' ? 'PAID' : 'PENDING',
              paidAt: item?.paidAt || null,
            }))
          : null,
      },
    });
    return created;
  });

  ipcMain.handle('faturamento-update', async (_event, lanc) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    if (!lanc?.id) throw new Error('ID do faturamento e obrigatorio.');
    if (isCentralEnabled()) {
      return centralBackendAdapter.updateFinancialAccount({
        clinicId: getCurrentClinicId(),
        accountId: lanc.id,
        account: {
          ...lanc,
        totalAmount: lanc.valor,
        description: lanc.descricao,
        dueDate: lanc.data || lanc.dueDate || null,
        paymentMethod: lanc?.paymentMethod || lanc?.metodoPagamento || '',
        paymentMethodDetail: lanc?.paymentMethodDetail || lanc?.paymentMethod || lanc?.metodoPagamento || '',
      },
    });
    }
    const list = await readFaturamento();
    const idx = list.findIndex((l) => l.id === lanc.id);
    if (idx == -1) throw new Error('Faturamento nao encontrado.');
    if (String(list[idx]?.clinicId || DEFAULT_CLINIC_ID) !== getCurrentClinicId()) throw new Error('Acesso negado.');
    const atualizado = {
      ...buildFaturamentoRecord(lanc, list[idx]),
      clinicId: list[idx].clinicId || getCurrentClinicId(),
    };
    list[idx] = atualizado;
    await writeFaturamento(list);
    return atualizado;
  });

  ipcMain.handle('faturamento-delete', async (_event, id) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    if (!id) throw new Error('ID e obrigatorio.');
    if (isCentralEnabled()) {
      return centralBackendAdapter.deleteFinancialAccount({
        clinicId: getCurrentClinicId(),
        accountId: id,
      });
    }
    const list = await readFaturamento();
    const filtered = list.filter((l) => {
      const sameClinic = String(l?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId();
      return !(sameClinic && l.id === id);
    });
    await writeFaturamento(filtered);
    return { success: true };
  });

  ipcMain.handle('faturamento-get-dashboard', async () => {
    requireAccess({ roles: ['admin'], perms: ['finance.view'] });
    if (isCentralEnabled()) {
      try {
        return await centralBackendAdapter.getFinancialDashboard({
          clinicId: getCurrentClinicId(),
        });
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        return fallback('faturamento-get-dashboard', async () => computeFaturamentoDashboard(byClinic(await readFaturamento())), error);
      }
    }
    return computeFaturamentoDashboard(byClinic(await readFaturamento()));
  });
};

module.exports = { registerFaturamentoHandlers };
