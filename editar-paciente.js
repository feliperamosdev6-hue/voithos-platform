// editar-paciente.js - reconstruido com suporte a dentista

document.addEventListener('DOMContentLoaded', async () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const usersApi = appApi.users || {};
  const patientsApi = appApi.patients || {};
  const servicesApi = appApi.services || {};
  const loadProceduresApi = appApi.loadProcedures;
  const patientForm = document.getElementById('patient-form');
  const savePatientBtn = patientForm?.querySelector('button[type="submit"]');
  const servicesBody = document.getElementById('services-body');
  const addServiceBtn = document.getElementById('add-service-btn');
  const deletePatientBtn = document.getElementById('delete-patient-btn');
  const modal = document.getElementById('service-modal');
  const modalName = document.getElementById('modal-service-name');
  const modalValue = document.getElementById('modal-service-value');
  const modalCancel = document.getElementById('modal-cancel');
  const modalConfirm = document.getElementById('modal-confirm');
  const proceduresDatalist = document.getElementById('procedures-datalist');
  const dentistaLabel = document.getElementById('dentistaAtualLabel');
  const btnTrocarDentista = document.getElementById('btnTrocarDentista');
  const selectDentista = document.getElementById('selectDentista');
  const selfieInput = document.getElementById('edit-selfie-input');
  const selfieSelectBtn = document.getElementById('edit-selfie-select-btn');
  const selfieRemoveBtn = document.getElementById('edit-selfie-remove-btn');
  const selfiePreview = document.getElementById('edit-selfie-preview');
  const selfiePlaceholder = document.getElementById('edit-selfie-placeholder');
  const selfieFileName = document.getElementById('edit-selfie-file-name');

  let currentUser = null;
  let dentistasList = [];
  let currentPatient = null;
  let procedures = [];
  let selectedSelfieFile = null;
  let isSavingPatient = false;

  const getClinicStorageKey = (baseKey, user = currentUser) => {
    const clinicId = String(user?.clinicId || '').trim();
    return clinicId ? `${baseKey}:${clinicId}` : `${baseKey}:global`;
  };

  const getClinicStorageCandidates = (baseKey, user = currentUser) => {
    const candidates = [getClinicStorageKey(baseKey, user), `${baseKey}:global`, baseKey];
    return candidates.filter((value, index) => value && candidates.indexOf(value) === index);
  };

  const consumeStoredPatientContext = (baseKey, user = currentUser) => {
    for (const key of getClinicStorageCandidates(baseKey, user)) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      localStorage.removeItem(key);
      try {
        return JSON.parse(raw);
      } catch (_) {
        continue;
      }
    }
    return null;
  };

  const maxSelfieBytes = 1 * 1024 * 1024;
  const maxSelfieDimension = 800;
  const acceptedSelfieTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  const acceptedSelfieExt = ['.png', '.jpg', '.jpeg', '.webp'];

  const isAcceptedSelfieFile = (file) => {
    if (!file) return false;
    const type = String(file.type || '').toLowerCase();
    const lowerName = String(file.name || '').toLowerCase();
    const hasAllowedExt = acceptedSelfieExt.some((ext) => lowerName.endsWith(ext));
    if (!hasAllowedExt) return false;
    return !type || acceptedSelfieTypes.includes(type);
  };

  const buildCompressedSelfieName = (name = '') => {
    const safeName = String(name || 'profile-photo').trim() || 'profile-photo';
    return safeName.replace(/\.[^.]+$/, '') + '.webp';
  };

  const blobToNamedFile = (blob, name) => {
    if (typeof File !== 'undefined') {
      return new File([blob], name, { type: blob.type || 'image/webp' });
    }
    blob.name = name;
    return blob;
  };

  const loadImageFromFile = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Nao foi possivel ler a imagem.'));
    };
    image.src = url;
  });

  const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });

  const compressSelfieForWeb = async (file) => {
    if ((file.size || 0) <= maxSelfieBytes) return file;
    if (file.path) {
      throw new Error('Arquivo muito grande. Limite: 1 MB.');
    }
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      throw new Error('Arquivo muito grande. Limite: 1 MB.');
    }
    const image = await loadImageFromFile(file);
    const ratio = Math.min(1, maxSelfieDimension / Math.max(image.width || 1, image.height || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.width || maxSelfieDimension) * ratio));
    canvas.height = Math.max(1, Math.round((image.height || maxSelfieDimension) * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Arquivo muito grande. Limite: 1 MB.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.78, 0.7, 0.62]) {
      const blob = await canvasToBlob(canvas, 'image/webp', quality);
      if (blob && blob.size <= maxSelfieBytes) {
        return blobToNamedFile(blob, buildCompressedSelfieName(file.name));
      }
    }
    throw new Error('Arquivo muito grande. Limite: 1 MB.');
  };

  const safeToast = (msg, type = 'info') => {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      console[type === 'error' ? 'error' : 'log'](msg);
      alert(msg);
    }
  };

  const setDentistaLabel = (nome) => {
    if (dentistaLabel) dentistaLabel.textContent = nome || 'Nao definido';
  };

  const setSavePatientLoading = (loading) => {
    isSavingPatient = loading;
    if (!savePatientBtn) return;
    savePatientBtn.disabled = loading;
    savePatientBtn.textContent = loading ? 'Salvando...' : 'Salvar Dados do Paciente';
  };

  const getFriendlySaveError = (err) => {
    const message = String(err?.message || '').trim();
    if (/dentista invalido|invalid_dentist/i.test(message)) return 'Dentista invalido para a clinica atual.';
    if (/outra clinica|clinic|tenant/i.test(message)) return 'Paciente nao encontrado para a clinica atual.';
    if (/arquivo|formato|foto|upload/i.test(message)) return message;
    if (/confirmados|persist|recarregar|retorno/i.test(message)) return message;
    return 'Nao foi possivel salvar os dados do paciente.';
  };

  const normalizeComparableValue = (value) => String(value || '').trim();

  const getPatientComparableValue = (patient = {}, field) => {
    if (field === 'nome') return patient.fullName || patient.nome || patient.name || '';
    if (field === 'telefone') return patient.phone || patient.telefone || patient.celular || patient.whatsapp || '';
    if (field === 'endereco') return patient.address || patient.endereco || '';
    if (field === 'dataNascimento') return toDateInputValue(patient.dataNascimento || patient.birthDate || patient.nascimento || '');
    return patient[field] || '';
  };

  const getChangedProfileFields = (before = {}, after = {}) => ([
    ['nome', after.nome],
    ['cpf', after.cpf],
    ['telefone', after.telefone],
    ['email', after.email],
    ['dataNascimento', after.dataNascimento],
    ['endereco', after.endereco],
  ]).filter(([field, value]) => (
    normalizeComparableValue(getPatientComparableValue(before, field)) !== normalizeComparableValue(value)
  ));

  const getPersistedProfileMismatches = (patient = {}, changedFields = []) => (
    changedFields.filter(([field, expected]) => (
      normalizeComparableValue(getPatientComparableValue(patient, field)) !== normalizeComparableValue(expected)
    )).map(([field]) => field)
  );

  const persistUpdatedPatientContext = (patient = {}) => {
    if (!patient || typeof patient !== 'object') return;
    try {
      sessionStorage.setItem('activeProntuarioPatient', JSON.stringify(patient));
    } catch (_) {}
    try {
      ['editingPatient', 'prontuarioPatient', 'servicePatient', 'documentsPatient'].forEach((baseKey) => {
        getClinicStorageCandidates(baseKey).forEach((key) => {
          if (localStorage.getItem(key)) {
            localStorage.setItem(key, JSON.stringify(patient));
          }
        });
      });
      localStorage.setItem(getClinicStorageKey('voithos-patient-updated'), JSON.stringify({
        patientId: patient.id || patient.prontuario || '',
        clinicId: currentUser?.clinicId || patient.clinicId || patient.clinicaId || '',
        updatedAt: new Date().toISOString(),
      }));
    } catch (_) {}
  };

  const setSelfieState = ({ file = null, url = '', label = '' } = {}) => {
    selectedSelfieFile = file || null;
    if (!selfiePreview || !selfiePlaceholder || !selfieFileName) return;

    if (file) {
      selfieFileName.textContent = file.name || 'Arquivo selecionado';
      selfiePlaceholder.textContent = '+';
      selfiePreview.src = URL.createObjectURL(file);
      selfiePreview.hidden = false;
      selfiePlaceholder.hidden = true;
      return;
    }

    if (url) {
      selfiePreview.src = url;
      selfiePreview.hidden = false;
      selfiePlaceholder.hidden = true;
      selfiePlaceholder.textContent = '+';
      selfieFileName.textContent = label || 'Selfie atual';
      return;
    }

    selfiePreview.hidden = true;
    selfiePreview.removeAttribute('src');
    selfiePlaceholder.hidden = false;
    selfiePlaceholder.textContent = '+';
    selfieFileName.textContent = 'Nenhum arquivo selecionado.';
  };

  const loadPersistedSelfiePreview = async (patient = {}) => {
    if (patient.selfieUrl || !patientsApi.getSelfieObjectUrl) return;
    if (!patient.selfiePath && !patient.profilePhotoPath) return;
    try {
      const url = await patientsApi.getSelfieObjectUrl({
        patientId: patient.id || patient.prontuario || patient._id,
        selfieUpdatedAt: patient.selfieUpdatedAt || patient.profilePhotoUpdatedAt || '',
      });
      const activeId = String(currentPatient?.id || currentPatient?.prontuario || currentPatient?._id || '');
      const targetId = String(patient.id || patient.prontuario || patient._id || '');
      if (activeId && targetId && activeId !== targetId) return;
      setSelfieState({ url, label: patient.selfieFileName || 'Foto atual' });
    } catch (_) {
    }
  };

  const loadDentistas = async () => {
    try {
      let users = [];
      if (usersApi.list) {
        users = await usersApi.list();
      } else if (authApi.listUsers) {
        users = await authApi.listUsers();
      }
      const currentClinicId = String(currentUser?.clinicId || '').trim();
      dentistasList = (users || []).filter((u) => {
        if (String(u?.tipo || '').toLowerCase() !== 'dentista') return false;
        const dentistClinicId = String(u?.clinicId || '').trim();
        return !currentClinicId || dentistClinicId === currentClinicId;
      });
      if (selectDentista) {
        const opts = dentistasList.map((d) => {
          const nome = d.nome || d.fullName || d.login || 'Dentista';
          const login = d.login ? ` (${d.login})` : '';
          return `<option value="${d.id}">${nome}${login}</option>`;
        }).join('');
        selectDentista.innerHTML = '<option value="">Selecione...</option>' + opts;
      }
    } catch (err) {
      console.error('Erro ao carregar dentistas:', err);
    }
  };

  const toggleSelectDentista = () => {
    if (!selectDentista) return;
    const visible = selectDentista.style.display !== 'none';
    selectDentista.style.display = visible ? 'none' : 'block';
  };

  const fillForm = (patient) => {
    document.getElementById('edit-fullName').value = patient.fullName || patient.nome || '';
    document.getElementById('edit-cpf').value = patient.cpf || '';
    document.getElementById('edit-rg').value = patient.rg || '';
    document.getElementById('edit-dataNascimento').value = toDateInputValue(patient.dataNascimento || patient.birthDate || '');
    document.getElementById('edit-prontuario').value = patient.prontuario || '';
    document.getElementById('edit-phone').value = patient.phone || '';
    document.getElementById('edit-allowsMessages').checked = patient.allowsMessages !== false;
    document.getElementById('edit-email').value = patient.email || '';
    document.getElementById('edit-address').value = patient.address || '';
    document.getElementById('edit-notes').value = patient.notes || '';
    setDentistaLabel(patient.dentistaNome);
    setSelfieState({ url: patient.selfieUrl || '', label: patient.selfieFileName || '' });
    loadPersistedSelfiePreview(patient);
  };

  const formatCurrency = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const toDateInputValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const renderServices = (services) => {
    if (!services || services.length === 0) {
      servicesBody.innerHTML = '<tr><td colspan="5">Nenhum servico registrado.</td></tr>';
      return;
    }

    servicesBody.innerHTML = services.map((svc) => {
      const date = svc.registeredAt ? new Date(svc.registeredAt).toLocaleDateString('pt-BR') : '';
      const dentes = svc.dentes && svc.dentes.length ? svc.dentes.join(', ') : '';
      return `
        <tr data-id="${svc.id}">
          <td class="svc-name">${svc.name || ''}</td>
          <td class="svc-value">${formatCurrency(svc.value)}</td>
          <td>${dentes ? `Dentes: ${dentes}` : ''}</td>
          <td>${date}</td>
          <td class="actions">
            <button class="action-btn edit-svc">Editar</button>
            <button class="action-btn delete-svc">Remover</button>
          </td>
        </tr>
      `;
    }).join('');
  };

  const loadServices = async () => {
    if (!currentPatient) return;
    try {
      const resp = await servicesApi.listForPatient(currentPatient.prontuario);
      const services = resp && resp.servicos ? resp.servicos : resp || [];
      renderServices(services);
    } catch (err) {
      console.error('Erro ao carregar servicos:', err);
      safeToast('Nao foi possivel carregar servicos.', 'error');
    }
  };

  const openModal = () => {
    modal.classList.add('show');
    modalName.value = '';
    modalValue.value = '';
    modalName.focus();
  };

  const closeModal = () => modal.classList.remove('show');

  const loadProceduresIntoDatalist = async () => {
    try {
      procedures = await loadProceduresApi();
      proceduresDatalist.innerHTML = procedures.map(p => `<option value="${p.nome}"></option>`).join('');
    } catch (err) {
      console.error('Erro ao carregar procedimentos:', err);
    }
  };

  btnTrocarDentista?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleSelectDentista();
  });

  selectDentista?.addEventListener('change', async (e) => {
    if (!currentPatient) return;
    if (currentUser?.tipo === 'dentista') return;
    const dentistaId = e.target.value;
    if (!dentistaId) return;
    const dent = dentistasList.find((d) => d.id === dentistaId);
    if (!dent) {
      selectDentista.value = '';
      safeToast('Dentista invalido para a clinica atual.', 'error');
      return;
    }
    const nome = dent?.nome || dent?.fullName || dent?.login || 'Dentista';
    const ok = confirm(`Transferir paciente para ${nome}?`);
    if (!ok) {
      selectDentista.value = dentistasList.some((item) => String(item.id || '') === String(currentPatient.dentistaId || ''))
        ? (currentPatient.dentistaId || '')
        : '';
      return;
    }
    try {
      const result = await patientsApi.updateDentist({ prontuario: currentPatient.prontuario, novoDentistaId: dentistaId });
      const savedPatient = result?.patient || result || {};
      currentPatient = {
        ...currentPatient,
        ...savedPatient,
        dentistaId: savedPatient.dentistaId || dentistaId,
        dentistaNome: savedPatient.dentistaNome || nome,
      };
      setDentistaLabel(currentPatient.dentistaNome);
      safeToast('Dentista atualizado para o paciente.', 'success');
    } catch (err) {
      console.error('Erro ao transferir dentista:', err);
      safeToast(getFriendlySaveError(err), 'error');
    }
  });

  selfieSelectBtn?.addEventListener('click', () => {
    selfieInput?.click();
  });

  selfieInput?.addEventListener('change', async () => {
    const file = selfieInput.files?.[0] || null;
    if (!file) {
      setSelfieState({ file: null, url: currentPatient?.selfieUrl || '', label: currentPatient?.selfieFileName || '' });
      loadPersistedSelfiePreview(currentPatient || {});
      return;
    }
    if (!isAcceptedSelfieFile(file)) {
      safeToast('Formato nao permitido.', 'error');
      selfieInput.value = '';
      return;
    }
    try {
      if (selfieFileName && (file.size || 0) > maxSelfieBytes && !file.path) {
        selfieFileName.textContent = 'Otimizando foto...';
      }
      const preparedFile = await compressSelfieForWeb(file);
      setSelfieState({ file: preparedFile });
    } catch (err) {
      safeToast(err?.message || 'Arquivo muito grande. Limite: 1 MB.', 'error');
      selfieInput.value = '';
      setSelfieState({ file: null, url: currentPatient?.selfieUrl || '', label: currentPatient?.selfieFileName || '' });
      loadPersistedSelfiePreview(currentPatient || {});
    }
  });

  selfieRemoveBtn?.addEventListener('click', () => {
    if (selfieInput) selfieInput.value = '';
    selectedSelfieFile = null;
    setSelfieState({ file: null, url: '', label: '' });
  });

  patientForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentPatient) return;
    if (isSavingPatient) return;
    const formProfile = {
      nome: document.getElementById('edit-fullName').value,
      cpf: document.getElementById('edit-cpf').value,
      rg: document.getElementById('edit-rg').value,
      dataNascimento: document.getElementById('edit-dataNascimento').value,
      telefone: document.getElementById('edit-phone').value,
      email: document.getElementById('edit-email').value,
      endereco: document.getElementById('edit-address').value,
      notes: document.getElementById('edit-notes').value,
    };
    const changedProfileFields = getChangedProfileFields(currentPatient, formProfile);
    const updated = {
      ...currentPatient,
      nome: formProfile.nome,
      fullName: formProfile.nome,
      cpf: formProfile.cpf,
      rg: formProfile.rg,
      dataNascimento: formProfile.dataNascimento,
      birthDate: formProfile.dataNascimento,
      prontuario: document.getElementById('edit-prontuario').value,
      telefone: formProfile.telefone,
      phone: formProfile.telefone,
      allowsMessages: !!document.getElementById('edit-allowsMessages').checked,
      email: formProfile.email,
      endereco: formProfile.endereco,
      address: formProfile.endereco,
      notes: formProfile.notes,
      observacoes: formProfile.notes,
    };
    delete updated.selfieUrl;
    if (currentUser?.tipo !== 'dentista') {
      const selectedDentistaId = selectDentista?.value || '';
      if (!selectedDentistaId) {
        safeToast('Selecione o dentista responsavel.', 'error');
        return;
      }
      const dent = dentistasList.find((d) => d.id === selectedDentistaId);
      if (!dent) {
        if (selectDentista) selectDentista.value = '';
        safeToast('Dentista invalido.', 'error');
        return;
      }
      const nomeDentista = dent.nome || dent.fullName || dent.login || 'Dentista';
      if ((currentPatient?.dentistaId || '') !== selectedDentistaId) {
        const ok = confirm(`Confirmar transferencia do paciente para ${nomeDentista}?`);
        if (!ok) return;
      }
      updated.dentistaId = dent.id;
      updated.dentistaNome = nomeDentista;
    }
    try {
      setSavePatientLoading(true);
      const selfieFileToUpload = selectedSelfieFile;
      const saveResult = await patientsApi.save(updated);
      const savedPatient = saveResult?.patient || saveResult || {};
      if (selfieFileToUpload) {
        if (!patientsApi.uploadSelfie) {
          throw new Error('Upload de foto indisponivel neste ambiente.');
        }
        const selfieResult = await patientsApi.uploadSelfie({
          prontuario: updated.prontuario,
          patientId: savedPatient.id || updated.id || updated.prontuario,
          filePath: selfieFileToUpload.path || '',
          file: selfieFileToUpload,
          fileName: selfieFileToUpload.name || 'profile-photo',
          mimeType: selfieFileToUpload.type || '',
        });
        updated.selfiePath = selfieResult?.selfiePath || updated.selfiePath || '';
        updated.selfieMime = selfieResult?.selfieMime || updated.selfieMime || '';
        updated.selfieUpdatedAt = selfieResult?.selfieUpdatedAt || updated.selfieUpdatedAt || '';
        updated.selfieUrl = selfieResult?.selfieUrl || updated.selfieUrl || '';
        updated.selfieFileName = selfieFileToUpload.name || updated.selfieFileName || '';
        if (selfieInput) selfieInput.value = '';
        selectedSelfieFile = null;
      }
      const readPatientId = savedPatient.prontuario || savedPatient.id || updated.id || updated.prontuario;
      if (!readPatientId) {
        throw new Error('Backend nao retornou identificador do paciente atualizado.');
      }
      const refreshed = await patientsApi.read(readPatientId);
      if (!refreshed) {
        throw new Error('Paciente atualizado nao foi recarregado para confirmar persistencia.');
      }
      currentPatient = {
        ...updated,
        ...savedPatient,
        ...refreshed,
      };
      const mismatches = getPersistedProfileMismatches(currentPatient, changedProfileFields);
      if (mismatches.length > 0) {
        throw new Error(`Dados nao foram confirmados como persistidos: ${mismatches.join(', ')}.`);
      }
      fillForm(currentPatient);
      if (selectDentista && currentPatient.dentistaId) {
        selectDentista.value = dentistasList.some((item) => String(item.id || '') === String(currentPatient.dentistaId || ''))
          ? currentPatient.dentistaId
          : '';
      }
      setSelfieState({ url: currentPatient.selfieUrl || '', label: currentPatient.selfieFileName || '' });
      persistUpdatedPatientContext(currentPatient);
      safeToast('Paciente atualizado com sucesso.', 'success');
    } catch (err) {
      console.error('Erro ao salvar paciente:', err);
      safeToast(getFriendlySaveError(err), 'error');
    } finally {
      setSavePatientLoading(false);
    }
  });

  deletePatientBtn?.addEventListener('click', async () => {
    if (!currentPatient) return;
    const ok = confirm('Tem certeza que deseja excluir este paciente? Esta acao nao pode ser desfeita.');
    if (!ok) return;
    try {
      await patientsApi.remove(currentPatient.prontuario);
      safeToast('Paciente excluido.', 'success');
      window.location.href = 'arquivos.html';
    } catch (err) {
      console.error('Erro ao excluir paciente:', err);
      safeToast('Falha ao excluir paciente: ' + err.message, 'error');
    }
  });

  addServiceBtn?.addEventListener('click', () => {
    if (!currentPatient?.dentistaId) {
      safeToast('Defina o dentista do paciente antes de registrar servicos.', 'error');
      return;
    }
    openModal();
  });

  modalCancel?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });

  modalConfirm?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!currentPatient) return;
    const name = modalName.value.trim();
    const value = parseFloat(modalValue.value) || 0;
    if (!name) {
      safeToast('Informe o procedimento.', 'error');
      return;
    }
    const proc = procedures.find(p => p.nome === name);
    const service = {
      name,
      value,
      code: proc?.codigo || 'N/A',
    };
    try {
      await servicesApi.addToPatient({ prontuario: currentPatient.prontuario, service });
      closeModal();
      await loadServices();
    } catch (err) {
      console.error('Erro ao adicionar servico:', err);
      safeToast('Falha ao adicionar servico: ' + err.message, 'error');
    }
  });

  servicesBody?.addEventListener('click', async (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    const serviceId = row.dataset.id;
    if (!serviceId || !currentPatient) return;

    if (e.target.classList.contains('delete-svc')) {
      const ok = confirm('Remover este servico?');
      if (!ok) return;
      try {
        await servicesApi.delete({ prontuario: currentPatient.prontuario, serviceId });
        await loadServices();
      } catch (err) {
        console.error('Erro ao remover servico:', err);
        safeToast('Falha ao remover: ' + err.message, 'error');
      }
      return;
    }

    if (e.target.classList.contains('edit-svc')) {
      const nameCell = row.querySelector('.svc-name');
      const valueCell = row.querySelector('.svc-value');
      const currentName = nameCell.textContent.trim();
      const currentValue = valueCell.textContent.replace(/[^0-9,-]/g, '').replace(',', '.') || '0';

      nameCell.innerHTML = `<input type="text" class="inline-input name" value="${currentName}">`;
      valueCell.innerHTML = `<input type="number" step="0.01" class="inline-input value" value="${currentValue}">`;
      e.target.textContent = 'Salvar';
      e.target.classList.remove('edit-svc');
      e.target.classList.add('save-svc');
      return;
    }

    if (e.target.classList.contains('save-svc')) {
      const nameInput = row.querySelector('input.name');
      const valueInput = row.querySelector('input.value');
      const updatedData = {
        name: nameInput.value,
        value: parseFloat(valueInput.value) || 0,
      };
      try {
        await servicesApi.update({ prontuario: currentPatient.prontuario, serviceId, updatedData });
        await loadServices();
      } catch (err) {
        console.error('Erro ao salvar servico:', err);
        safeToast('Falha ao salvar servico: ' + err.message, 'error');
      }
      return;
    }
  });

  const init = async () => {
    try {
      currentUser = await authApi.currentUser?.();
    } catch (err) {
      console.warn('Nao foi possivel carregar usuario atual antes da reidratacao do paciente.', err);
    }

    const params = new URLSearchParams(window.location.search);
    const prontuarioParam = params.get('prontuario');
    let prontuario = prontuarioParam;

    if (!prontuario) {
      const parsed = consumeStoredPatientContext('editingPatient', currentUser);
      prontuario = parsed?.prontuario || parsed?.id || parsed?._id || null;
    }

    if (!prontuario) {
      safeToast('Nenhum paciente selecionado.', 'error');
      window.location.href = 'arquivos.html';
      return;
    }

    try {
      await loadDentistas();
      currentPatient = await patientsApi.read(prontuario);
      if (!currentPatient) throw new Error('Paciente nao encontrado.');
      if (currentUser?.tipo === 'dentista') {
        if (!currentPatient.dentistaId) {
          safeToast('Paciente sem dentista atribuido. Solicite atribuicao ao administrador.', 'error');
          window.location.href = 'arquivos.html';
          return;
        }
        if (currentPatient.dentistaId !== currentUser.id) {
          safeToast('Paciente pertence a outro dentista. Acesso bloqueado.', 'error');
          window.location.href = 'arquivos.html';
          return;
        }
      }
      fillForm(currentPatient);
      if (selectDentista && currentPatient.dentistaId) {
        selectDentista.value = dentistasList.some((item) => String(item.id || '') === String(currentPatient.dentistaId || ''))
          ? currentPatient.dentistaId
          : '';
      }
      if (currentUser?.tipo === 'dentista') {
        btnTrocarDentista?.classList.add('hidden');
        selectDentista?.classList.add('hidden');
        if (selectDentista) selectDentista.style.display = 'none';
      } else {
        btnTrocarDentista?.classList.remove('hidden');
        selectDentista?.classList.remove('hidden');
        if (selectDentista) selectDentista.style.display = 'block';
      }
      await loadProceduresIntoDatalist();
      await loadServices();
    } catch (err) {
      console.error('Erro ao carregar paciente:', err);
      safeToast('Nao foi possivel carregar o paciente: ' + err.message, 'error');
      window.location.href = 'arquivos.html';
    }
  };

  init();
});

