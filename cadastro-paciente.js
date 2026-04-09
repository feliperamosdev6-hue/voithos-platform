document.addEventListener('DOMContentLoaded', async () => {
    const patientForm = document.getElementById('patient-form');
    const prontuarioField = document.getElementById('prontuario');
    const selectDentista = document.getElementById('selectDentista');
    const dentistaGroup = document.getElementById('dentista-group');
    const allowsMessagesField = document.getElementById('allowsMessages');
    const selfieInput = document.getElementById('selfie-input');
    const selfieSelectBtn = document.getElementById('selfie-select-btn');
    const selfieRemoveBtn = document.getElementById('selfie-remove-btn');
    const selfiePreview = document.getElementById('selfie-preview');
    const selfiePlaceholder = document.getElementById('selfie-placeholder');
    const selfieFileName = document.getElementById('selfie-file-name');
    let currentUser = null;
    let dentistasList = [];
    let selectedSelfieFile = null;
    const appApi = window.appApi || {};
    const authApi = appApi.auth || window.auth || {};
    const patientsApi = appApi.patients || {};
    const logPatientCreate = (stage, extra = {}) => {
        try {
            console.info(`[PATIENT_CREATE] ${stage}`, JSON.stringify(extra));
        } catch (_) {
            console.info(`[PATIENT_CREATE] ${stage}`, extra);
        }
    };

    const acceptedSelfieTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'application/pdf'];
    const acceptedSelfieExt = ['.png', '.jpg', '.jpeg', '.svg', '.pdf'];
    const canManagePatientDentist = (user) => {
        const tipo = String(user?.tipo || '').trim().toLowerCase();
        return user?.permissions?.admin === true || ['admin', 'administrativo', 'recepcionista'].includes(tipo);
    };

    const isAcceptedSelfieFile = (file) => {
        if (!file) return false;
        const type = String(file.type || '').toLowerCase();
        if (acceptedSelfieTypes.includes(type)) return true;
        const lowerName = String(file.name || '').toLowerCase();
        return acceptedSelfieExt.some((ext) => lowerName.endsWith(ext));
    };

    const setSelfieState = (file) => {
        selectedSelfieFile = file || null;
        if (!selfiePreview || !selfiePlaceholder || !selfieFileName) return;

        if (!file) {
            selfiePreview.hidden = true;
            selfiePreview.removeAttribute('src');
            selfiePlaceholder.hidden = false;
            selfiePlaceholder.textContent = '+';
            selfieFileName.textContent = 'Nenhum arquivo selecionado.';
            return;
        }

        selfieFileName.textContent = file.name || 'Arquivo selecionado';

        if (String(file.type || '').toLowerCase() === 'application/pdf') {
            selfiePreview.hidden = true;
            selfiePreview.removeAttribute('src');
            selfiePlaceholder.hidden = false;
            selfiePlaceholder.textContent = 'PDF';
            return;
        }

        selfiePlaceholder.textContent = '+';
        const objectUrl = URL.createObjectURL(file);
        selfiePreview.src = objectUrl;
        selfiePreview.hidden = false;
        selfiePlaceholder.hidden = true;
    };

    function generateProntuario() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }

    const loadDentistas = async () => {
        try {
            const users = await (authApi.listUsers ? authApi.listUsers() : []);
            const currentClinicId = String(currentUser?.clinicId || '').trim();
            dentistasList = (users || [])
                .filter((u) => {
                    const tipo = String(u?.tipo || '').toLowerCase();
                    const role = String(u?.role || '').toUpperCase();
                    if (!(tipo === 'dentista' || role === 'DENTISTA')) return false;
                    const dentistClinicId = String(u?.clinicId || '').trim();
                    return !currentClinicId || dentistClinicId === currentClinicId;
                })
                .map((u) => ({
                    ...u,
                    id: String(u?.id || u?.userId || '').trim(),
                }))
                .filter((u) => !!u.id);
            if (selectDentista) {
                const options = dentistasList.map((d) => {
                    const nome = d.nome || d.fullName || d.login || 'Dentista';
                    const login = d.login ? ` (${d.login})` : '';
                    return `<option value="${d.id}">${nome}${login}</option>`;
                }).join('');
                selectDentista.innerHTML = '<option value="">Selecione...</option>' + options;
                if (!options) {
                    selectDentista.innerHTML = '<option value="">Nenhum dentista cadastrado</option>';
                }
            }
        } catch (err) {
            console.error('Erro ao carregar dentistas:', err);
            if (selectDentista) {
                selectDentista.innerHTML = '<option value="">Falha ao carregar dentistas</option>';
            }
        }
    };

    prontuarioField.value = generateProntuario();

    currentUser = await (authApi.currentUser ? authApi.currentUser() : null);
    if (canManagePatientDentist(currentUser)) {
        if (dentistaGroup) dentistaGroup.style.display = 'block';
        await loadDentistas();
    } else {
        if (dentistaGroup) dentistaGroup.style.display = 'none';
    }

    selfieSelectBtn?.addEventListener('click', () => {
        selfieInput?.click();
    });

    selfieInput?.addEventListener('change', () => {
        const file = selfieInput.files?.[0] || null;
        if (!file) {
            setSelfieState(null);
            return;
        }
        if (!isAcceptedSelfieFile(file)) {
            alert('Formato nao suportado para selfie. Use PNG, JPG, JPEG, SVG ou PDF.');
            selfieInput.value = '';
            setSelfieState(null);
            return;
        }
        setSelfieState(file);
    });

    selfieRemoveBtn?.addEventListener('click', () => {
        if (selfieInput) selfieInput.value = '';
        setSelfieState(null);
    });

    patientForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!patientForm.checkValidity()) {
            patientForm.reportValidity();
            return;
        }

        const formData = new FormData(patientForm);
        const patientData = {};
        for (const [key, value] of formData.entries()) {
            patientData[key] = value;
        }
        patientData.allowsMessages = allowsMessagesField ? !!allowsMessagesField.checked : true;

        try {
            if (canManagePatientDentist(currentUser)) {
                const selectedDentistaId = String(selectDentista?.value || '').trim();
                if (selectedDentistaId) {
                    const dent = dentistasList.find((d) => d.id === selectedDentistaId);
                    if (!dent) {
                        if (selectDentista) selectDentista.value = '';
                        alert('Dentista invalido.');
                        return;
                    }
                    patientData.dentistaId = dent.id;
                    patientData.dentistaNome = dent.nome || dent.fullName || dent.login || 'Dentista';
                } else {
                    patientData.dentistaId = '';
                    patientData.dentistaNome = '';
                }
            }

            const savedProntuario = patientData.prontuario;
            logPatientCreate('patient_create_started', {
                hasDentista: Boolean(patientData.dentistaId),
                selected_dentist_id: patientData.dentistaId || '',
                prontuario: savedProntuario || '',
                clinicId: currentUser?.clinicId || '',
            });
            if (!patientsApi.save) {
                throw new Error('Cadastro de paciente indisponivel neste ambiente.');
            }
            const saveResult = await patientsApi.save(patientData);
            const canonicalPatientKey = String(
                saveResult?.patient?.prontuario
                || saveResult?.patient?.id
                || savedProntuario
                || ''
            ).trim();

            if (selectedSelfieFile?.path && patientsApi.uploadSelfie && canonicalPatientKey) {
                await patientsApi.uploadSelfie({
                    prontuario: canonicalPatientKey,
                    filePath: selectedSelfieFile.path,
                    fileName: selectedSelfieFile.name || 'selfie',
                    mimeType: selectedSelfieFile.type || '',
                });
            }

            let hydratedPatient = null;
            if (canonicalPatientKey && patientsApi.read) {
                try {
                    hydratedPatient = await patientsApi.read(canonicalPatientKey);
                } catch (readError) {
                    console.warn('[PATIENT_CREATE] falha ao hidratar paciente apos create', readError);
                }
            }

            const persistedPatient = {
                ...(saveResult?.patient || {}),
                ...(hydratedPatient || {}),
                id: hydratedPatient?.id || saveResult?.patient?.id || canonicalPatientKey,
                prontuario: hydratedPatient?.prontuario || saveResult?.patient?.prontuario || canonicalPatientKey,
                nome: hydratedPatient?.nome || saveResult?.patient?.nome || patientData.nome || patientData.fullName || '',
                fullName: hydratedPatient?.fullName || saveResult?.patient?.fullName || saveResult?.patient?.nome || patientData.fullName || patientData.nome || '',
                dentistaId: hydratedPatient?.dentistaId || saveResult?.patient?.dentistaId || patientData.dentistaId || '',
                dentistaNome: hydratedPatient?.dentistaNome || saveResult?.patient?.dentistaNome || patientData.dentistaNome || '',
                clinicId: hydratedPatient?.clinicId || saveResult?.patient?.clinicId || currentUser?.clinicId || '',
            };
            logPatientCreate('patient_create_completed', {
                patientId: persistedPatient.id || '',
                prontuario: persistedPatient.prontuario || '',
                hasDentista: Boolean(persistedPatient.dentistaId),
                selected_dentist_id: persistedPatient.dentistaId || '',
                storageKey: 'prontuarioPatient',
            });

            alert('Cadastro feito com sucesso!');
            localStorage.setItem('prontuarioPatient', JSON.stringify(persistedPatient));
            window.location.href = 'prontuario.html';
        } catch (error) {
            console.error('Erro ao salvar paciente:', error);
            alert(`Ocorreu um erro ao cadastrar o paciente: ${error.message}`);
        }
    });

});
