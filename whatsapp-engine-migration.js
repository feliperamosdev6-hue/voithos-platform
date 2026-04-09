document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('btn-open-clinic-whatsapp');
  const statusEl = document.getElementById('whatsapp-migration-status');

  const setStatus = (text) => {
    if (!statusEl) return;
    statusEl.textContent = text;
  };

  button?.addEventListener('click', () => {
    window.location.href = 'clinica.html';
  });

  setStatus('Use a area "WhatsApp da clinica" em "Minha clinica" para conectar, acompanhar o status e operar o numero da clinica.');
});
