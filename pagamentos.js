document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = Array.from(document.querySelectorAll('[data-payments-tab]'));
  const tabPanels = Array.from(document.querySelectorAll('[data-payments-panel]'));
  const methodButtons = Array.from(document.querySelectorAll('[data-method]'));
  const amountInput = document.getElementById('simulator-amount');
  const passFeeInput = document.getElementById('simulator-pass-fee');
  const installmentsSelect = document.getElementById('simulator-installments');
  const installmentsHint = document.getElementById('simulator-installments-hint');

  const rateEl = document.getElementById('simulator-rate');
  const feeEl = document.getElementById('simulator-fee');
  const grossEl = document.getElementById('simulator-gross');
  const installmentValueEl = document.getElementById('simulator-installment-value');
  const netEl = document.getElementById('simulator-net');
  const liquidEl = document.getElementById('simulator-liquid');
  const methodLabelEl = document.getElementById('simulator-method-label');
  const installmentsLabelEl = document.getElementById('simulator-installments-label');
  const noteEl = document.getElementById('simulator-note');

  const setActivePaymentsTab = (tabKey) => {
    const targetKey = tabKey === 'meios' ? 'meios' : 'simulador';
    tabButtons.forEach((button) => {
      const active = button.dataset.paymentsTab === targetKey;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.paymentsPanel !== targetKey;
    });
  };

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActivePaymentsTab(button.dataset.paymentsTab || 'simulador');
    });
  });

  if (!amountInput || !passFeeInput || !installmentsSelect || !rateEl || !feeEl || !grossEl || !installmentValueEl || !netEl || !liquidEl || !methodLabelEl || !installmentsLabelEl || !noteEl) {
    return;
  }

  const currency = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const state = {
    method: 'debit',
    amount: 0,
    passFee: false,
    installments: 1,
  };

  const rates = {
    debit: 0.008,
    credit: 0.0299,
    pix: 0,
  };

  const formatPercent = (value) => `${(value * 100).toFixed(2).replace('.', ',')}%`;

  const formatCurrency = (value) => currency.format(Number.isFinite(value) ? value : 0);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const parseAmount = () => {
    const value = Number(String(amountInput.value || '').replace(',', '.'));
    if (!Number.isFinite(value)) return 0;
    return clamp(value, 0, 500000);
  };

  const getFeeRate = () => {
    if (state.method === 'credit') {
      const extraInstallments = Math.max(0, state.installments - 1);
      return Math.min(0.0899, rates.credit + extraInstallments * 0.0055);
    }
    return rates[state.method] || 0;
  };

  const setActiveMethod = (method) => {
    state.method = method;
    methodButtons.forEach((button) => {
      const active = button.dataset.method === method;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const creditSelected = method === 'credit';
    installmentsSelect.disabled = !creditSelected;
    installmentsHint.textContent = creditSelected
      ? 'A taxa varia conforme o número de parcelas.'
      : 'Credito habilita parcelamento.';

    if (!creditSelected) {
      state.installments = 1;
      installmentsSelect.value = '1';
    }
    render();
  };

  const render = () => {
    state.amount = parseAmount();
    state.passFee = passFeeInput.checked;
    if (state.method === 'credit') {
      state.installments = clamp(Number(installmentsSelect.value) || 1, 1, 12);
      installmentsSelect.value = String(state.installments);
    } else {
      state.installments = 1;
      installmentsSelect.value = '1';
    }

    const feeRate = getFeeRate();
    const fee = state.amount * feeRate;
    const gross = state.amount;
    const net = state.passFee ? gross : Math.max(0, gross - fee);
    const charge = state.passFee ? gross + fee : gross;
    const installmentValue = state.method === 'credit' && state.installments > 1
      ? charge / state.installments
      : null;

    const methodNames = {
      debit: 'Debito',
      credit: 'Credito',
      pix: 'Pix',
    };

    rateEl.textContent = formatPercent(feeRate);
    feeEl.textContent = formatCurrency(fee);
    grossEl.textContent = formatCurrency(charge);
    installmentValueEl.textContent = installmentValue !== null ? `${formatCurrency(installmentValue)} por parcela` : 'A vista';
    netEl.textContent = formatCurrency(net);
    liquidEl.textContent = formatCurrency(net);
    methodLabelEl.textContent = methodNames[state.method] || 'Debito';
    installmentsLabelEl.textContent = state.method === 'credit' && state.installments > 1
      ? `${state.installments} parcelas`
      : 'A vista';

    noteEl.textContent = state.passFee
      ? 'A taxa esta sendo repassada ao cliente nesta operacao.'
      : 'Voce absorve a taxa nesta operacao.';
  };

  methodButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveMethod(button.dataset.method || 'debit');
    });
  });

  amountInput.addEventListener('input', render);
  amountInput.addEventListener('blur', render);
  passFeeInput.addEventListener('change', render);
  installmentsSelect.addEventListener('change', render);

  setActivePaymentsTab(window.location.hash === '#meios-pagamento' ? 'meios' : 'simulador');
  setActiveMethod('debit');
  render();
});
