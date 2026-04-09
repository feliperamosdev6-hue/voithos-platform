document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const agendaAvailabilityApi = appApi.agendaAvailability || {};
  const daysGrid = document.getElementById('days-grid');
  const startTime = document.getElementById('start-time');
  const endTime = document.getElementById('end-time');
  const breakStart = document.getElementById('break-start');
  const breakEnd = document.getElementById('break-end');
  const slotMinutes = document.getElementById('slot-minutes');
  const allowOverbooking = document.getElementById('allow-overbooking');
  const saveBtn = document.getElementById('save-availability');
  const statusEl = document.getElementById('availability-status');

  const weekDays = [
    { value: 1, label: 'Segunda' },
    { value: 2, label: 'Terca' },
    { value: 3, label: 'Quarta' },
    { value: 4, label: 'Quinta' },
    { value: 5, label: 'Sexta' },
    { value: 6, label: 'Sabado' },
    { value: 0, label: 'Domingo' },
  ];

  const ensureAccess = async () => {
    try {
      const user = await authApi.currentUser();
      const perms = user?.permissions || {};
      const allowed = user?.tipo === 'admin' || perms.admin === true || perms['agenda.availability'] === true;
      if (!user || !allowed) {
        window.location.href = 'index.html';
        return false;
      }
      return true;
    } catch (_) {
      window.location.href = 'index.html';
      return false;
    }
  };

  const setStatus = (text) => {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    if (text) {
      setTimeout(() => {
        if (statusEl.textContent === text) statusEl.textContent = '';
      }, 2000);
    }
  };

  const renderDays = (selected = []) => {
    if (!daysGrid) return;
    daysGrid.innerHTML = '';
    weekDays.forEach((day) => {
      const label = document.createElement('label');
      label.className = 'day-pill';
      label.innerHTML = `
        <input type="checkbox" value="${day.value}">
        <span>${day.label}</span>
      `;
      const input = label.querySelector('input');
      if (input && selected.includes(day.value)) input.checked = true;
      daysGrid.appendChild(label);
    });
  };

  const getSelectedDays = () => {
    if (!daysGrid) return [];
    return Array.from(daysGrid.querySelectorAll('input[type="checkbox"]'))
      .filter((input) => input.checked)
      .map((input) => Number(input.value));
  };

  const loadAvailability = async () => {
    try {
      const data = await agendaAvailabilityApi.get();
      renderDays(data?.workDays || []);
      if (startTime) startTime.value = data?.startTime || '08:00';
      if (endTime) endTime.value = data?.endTime || '18:00';
      if (breakStart) breakStart.value = data?.breakStart || '12:00';
      if (breakEnd) breakEnd.value = data?.breakEnd || '13:00';
      if (slotMinutes) slotMinutes.value = data?.slotMinutes || 30;
      if (allowOverbooking) allowOverbooking.checked = !!data?.allowOverbooking;
    } catch (err) {
      console.error('Erro ao carregar disponibilidade', err);
      renderDays([]);
    }
  };

  saveBtn?.addEventListener('click', async () => {
    try {
      await agendaAvailabilityApi.save({
        workDays: getSelectedDays(),
        startTime: startTime?.value || '08:00',
        endTime: endTime?.value || '18:00',
        breakStart: breakStart?.value || '12:00',
        breakEnd: breakEnd?.value || '13:00',
        slotMinutes: Number(slotMinutes?.value || 30),
        allowOverbooking: !!allowOverbooking?.checked,
      });
      setStatus('Disponibilidade salva');
    } catch (err) {
      console.error('Erro ao salvar disponibilidade', err);
      setStatus(err?.message || 'Erro ao salvar');
    }
  });

  (async () => {
    const ok = await ensureAccess();
    if (!ok) return;
    renderDays([1, 2, 3, 4, 5]);
    loadAvailability();
  })();
});
