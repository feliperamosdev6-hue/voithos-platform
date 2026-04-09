document.addEventListener('DOMContentLoaded', () => {
  const patientListContainer = document.getElementById('patientList');
  const searchInput = document.getElementById('searchPatient');
  let patientsCache = [];

  const safeText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value);
  };

  const renderPatients = (patients, emptyMessage) => {
    patientListContainer.innerHTML = '';

    if (!patients.length) {
      patientListContainer.innerHTML = `<p>${emptyMessage}</p>`;
      return;
    }

    patients.forEach((patient) => {
      const patientCard = document.createElement('div');
      patientCard.classList.add('patient-card');
      patientCard.innerHTML = `
        <h3>${safeText(patient.nome || patient.fullName)}</h3>
        <p><strong>Prontuario:</strong> ${safeText(patient.prontuario || '-')}</p>
        <p><strong>CPF:</strong> ${safeText(patient.cpf || '-')}</p>
        <p><strong>Telefone:</strong> ${safeText(patient.telefone || patient.phone || '-')}</p>
        <p><strong>Data de nascimento:</strong> ${safeText(patient.data_nascimento || patient.birthDate || '-')}</p>
        <p><strong>Email:</strong> ${safeText(patient.email || '-')}</p>
        <p><strong>Endereco:</strong> ${safeText(patient.endereco || patient.address || '-')}</p>
      `;
      patientListContainer.appendChild(patientCard);
    });
  };

  const loadPatients = async () => {
    patientListContainer.innerHTML = '<p>Carregando...</p>';

    try {
      if (!window.appApi?.patients?.list) {
        throw new Error('Adapter de pacientes indisponivel.');
      }

      const data = await window.appApi.patients.list();
      patientsCache = Array.isArray(data) ? data : [];
      renderPatients(patientsCache, 'Nenhum paciente cadastrado ainda.');
    } catch (err) {
      console.error('Erro ao carregar pacientes', err);
      patientListContainer.innerHTML = '<p>Falha ao carregar pacientes. Verifique o backend.</p>';
    }
  };

  const filterPatients = () => {
    const term = searchInput.value.toLowerCase().trim();
    if (!term) {
      renderPatients(patientsCache, 'Nenhum paciente cadastrado ainda.');
      return;
    }

    const filtered = patientsCache.filter((patient) => {
      const nome = safeText(patient.nome || patient.fullName).toLowerCase();
      const prontuario = safeText(patient.prontuario).toLowerCase();
      const cpf = safeText(patient.cpf).toLowerCase();
      return nome.includes(term) || prontuario.includes(term) || cpf.includes(term);
    });

    renderPatients(filtered, 'Nenhum paciente encontrado com o termo de busca.');
  };

  searchInput.addEventListener('input', filterPatients);
  loadPatients();
});
