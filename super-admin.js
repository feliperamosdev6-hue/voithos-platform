document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const clinicForm = document.getElementById('clinic-form');
  const btnCreate = document.getElementById('btn-create-clinic');
  const clinicsList = document.getElementById('clinics-list');
  const createError = document.getElementById('create-error');
  const btnLogout = document.getElementById('btn-logout');
  const btnOpenWhatsappSupport = document.getElementById('btn-open-whatsapp-support');

  const successModal = document.getElementById('success-modal');
  const successClinicName = document.getElementById('success-clinic-name');
  const successAdminEmail = document.getElementById('success-admin-email');
  const successAdminPassword = document.getElementById('success-admin-password');
  const btnCopyCredentials = document.getElementById('btn-copy-credentials');
  const btnOpenCreatedClinic = document.getElementById('btn-open-created-clinic');
  const btnCloseSuccessModal = document.getElementById('btn-close-success-modal');
  const btnCloseSuccessModalX = document.getElementById('btn-close-success-modal-x');

  const clinicCredentialsCache = new Map();
  let lastCreatedClinicId = '';

  const setError = (message) => {
    if (createError) createError.textContent = message || '';
  };

  const copyText = async (text) => {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
  };

  const closeSuccessModal = () => {
    if (!successModal) return;
    successModal.classList.remove('is-open');
    successModal.hidden = true;
  };

  const openSuccessModal = ({ clinicId, clinicName, email, senhaTemporaria }) => {
    if (!successModal) return;
    lastCreatedClinicId = clinicId;
    if (successClinicName) successClinicName.textContent = clinicName || '';
    if (successAdminEmail) successAdminEmail.textContent = email || '-';
    if (successAdminPassword) successAdminPassword.textContent = senhaTemporaria || '-';
    successModal.hidden = false;
    successModal.classList.add('is-open');
  };

  const buildCredentialsLabel = (credentials) => {
    if (!credentials?.email || !credentials?.senhaTemporaria) return '';
    return `Email: ${credentials.email}\nSenha temporaria: ${credentials.senhaTemporaria}`;
  };

  const impersonateClinic = async (clinicId) => {
    const targetClinicId = String(clinicId || '').trim();
    if (!targetClinicId) {
      setError('Clinica invalida para abrir.');
      return;
    }

    try {
      await authApi.impersonateClinic(targetClinicId);
      window.location.href = 'index.html';
    } catch (err) {
      setError(err?.message || 'Falha ao abrir clinica.');
    }
  };

  const renderClinics = (clinics) => {
    if (!clinicsList) return;
    if (!Array.isArray(clinics) || clinics.length === 0) {
      clinicsList.innerHTML = '<div class="list-empty">Nenhuma clinica cadastrada.</div>';
      return;
    }

    clinicsList.innerHTML = clinics.map((clinic) => {
      const status = clinic.status === 'active' ? 'Ativa' : 'Suspensa';
      const clinicId = String(clinic.clinicId || '');
      const hasCredentials = clinicCredentialsCache.has(clinicId);
      return `
        <article class="clinic-item" data-clinic-id="${clinicId}">
          <div class="clinic-name">${clinic.nomeFantasia || clinic.razaoSocial || 'Sem nome'}</div>
          <div class="clinic-meta">ID: ${clinicId}</div>
          <div class="clinic-meta">CNPJ/CPF: ${clinic.cnpjOuCpf || '-'}</div>
          <div class="clinic-meta">Status: ${status}</div>
          <div class="clinic-actions">
            <button type="button" class="btn-primary" data-action="open-clinic" data-clinic-id="${clinicId}">Abrir clinica</button>
            <button type="button" data-action="copy-id" data-clinic-id="${clinicId}">Copiar ID</button>
            ${hasCredentials ? `<button type="button" data-action="copy-credentials" data-clinic-id="${clinicId}">Copiar credenciais</button>` : ''}
          </div>
        </article>
      `;
    }).join('');
  };

  const ensureSuperAdmin = async () => {
    const user = await authApi.currentUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    if (user.tipo !== 'super_admin') {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  };

  const loadClinics = async () => {
    try {
      const clinics = await authApi.listClinics();
      renderClinics(clinics || []);
      return clinics || [];
    } catch (err) {
      clinicsList.textContent = err?.message || 'Falha ao carregar clinicas.';
      return [];
    }
  };

  btnCreate?.addEventListener('click', async () => {
    setError('');

    const clinicNomeInput = String(document.getElementById('clinic-nome')?.value || '').trim();
    const clinicRazaoInput = String(document.getElementById('clinic-razao')?.value || '').trim();
    const clinicCnpjInput = String(document.getElementById('clinic-cnpj')?.value || '').trim();

    const payload = {
      clinic: {
        nomeFantasia: clinicNomeInput,
        razaoSocial: clinicRazaoInput,
        cnpjOuCpf: clinicCnpjInput,
        emailClinica: String(document.getElementById('clinic-email')?.value || '').trim(),
        telefone: String(document.getElementById('clinic-telefone')?.value || '').trim(),
        whatsapp: String(document.getElementById('clinic-whatsapp')?.value || '').trim(),
      },
      admin: {
        nome: String(document.getElementById('admin-nome')?.value || '').trim(),
        email: String(document.getElementById('admin-email')?.value || '').trim().toLowerCase(),
      },
    };

    if (!payload.clinic.nomeFantasia || !payload.clinic.razaoSocial || !payload.clinic.cnpjOuCpf || !payload.admin.nome || !payload.admin.email) {
      setError('Preencha os campos obrigatorios.');
      return;
    }

    try {
      const result = await authApi.createClinic(payload);
      const clinics = await loadClinics();

      let clinicId = String(result?.clinic?.clinicId || '').trim();
      let clinicName = result?.clinic?.nomeFantasia || result?.clinic?.razaoSocial || '';
      if (!clinicId) {
        const inferred = clinics.find((clinic) =>
          String(clinic?.cnpjOuCpf || '').trim() === clinicCnpjInput
          || String(clinic?.nomeFantasia || '').trim() === clinicNomeInput
          || String(clinic?.razaoSocial || '').trim() === clinicRazaoInput
        );
        if (inferred) {
          clinicId = String(inferred.clinicId || '').trim();
          clinicName = clinicName || inferred.nomeFantasia || inferred.razaoSocial || '';
        }
      }

      if (clinicId && result?.credentials?.email && result?.credentials?.senhaTemporaria) {
        clinicCredentialsCache.set(clinicId, {
          email: result.credentials.email,
          senhaTemporaria: result.credentials.senhaTemporaria,
        });
      }

      openSuccessModal({
        clinicId,
        clinicName: clinicName || clinicId,
        email: result?.credentials?.email || '',
        senhaTemporaria: result?.credentials?.senhaTemporaria || '',
      });

      clinicForm?.reset();
      if (!clinicId) {
        setError('Clinica criada, mas nao foi possivel identificar o clinicId para impersonacao imediata.');
      }
    } catch (err) {
      setError(err?.message || 'Falha ao criar clinica.');
    }
  });

  clinicsList?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    const clinicId = target.dataset.clinicId;
    if (!action || !clinicId) return;

    if (action === 'open-clinic') {
      await impersonateClinic(clinicId);
      return;
    }

    if (action === 'copy-id') {
      try {
        await copyText(clinicId);
      } catch (_err) {
        setError('Nao foi possivel copiar o ID da clinica.');
      }
      return;
    }

    if (action === 'copy-credentials') {
      const credentials = clinicCredentialsCache.get(clinicId);
      if (!credentials) {
        setError('Credenciais nao disponiveis para esta clinica nesta sessao.');
        return;
      }
      try {
        await copyText(buildCredentialsLabel(credentials));
      } catch (_err) {
        setError('Nao foi possivel copiar as credenciais.');
      }
    }
  });

  btnCopyCredentials?.addEventListener('click', async () => {
    const credentials = clinicCredentialsCache.get(lastCreatedClinicId);
    if (!credentials) {
      setError('Credenciais indisponiveis.');
      return;
    }
    try {
      await copyText(buildCredentialsLabel(credentials));
    } catch (_err) {
      setError('Nao foi possivel copiar as credenciais.');
    }
  });

  btnOpenCreatedClinic?.addEventListener('click', async () => {
    if (!lastCreatedClinicId) {
      setError('Clinica recem criada nao encontrada.');
      return;
    }
    await impersonateClinic(lastCreatedClinicId);
  });

  btnCloseSuccessModal?.addEventListener('click', () => {
    closeSuccessModal();
  });
  btnCloseSuccessModalX?.addEventListener('click', () => {
    closeSuccessModal();
  });

  successModal?.addEventListener('click', (event) => {
    if (event.target === successModal) {
      closeSuccessModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && successModal && !successModal.hidden) {
      closeSuccessModal();
    }
  });

  btnLogout?.addEventListener('click', async () => {
    try {
      await authApi.logout();
    } finally {
      window.location.href = 'login.html';
    }
  });

  btnOpenWhatsappSupport?.addEventListener('click', async () => {
    try {
      if (!appApi?.openExternalUrl) {
        throw new Error('Abertura do painel global do WhatsApp NG indisponivel neste ambiente.');
      }
      await appApi.openExternalUrl('http://127.0.0.1:8099/admin/login');
    } catch (err) {
      setError(err?.message || 'Falha ao abrir o painel global do WhatsApp NG.');
    }
  });

  (async () => {
    try {
      const user = await ensureSuperAdmin();
      if (!user) return;
      await loadClinics();
    } catch (_err) {
      window.location.href = 'login.html';
    }
  })();
});

