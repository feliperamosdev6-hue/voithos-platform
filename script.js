// Script principal da home
// Mantem menu de usuario no header

document.addEventListener('DOMContentLoaded', () => {
    const appApi = window.appApi || {};
    const authApi = appApi.auth || window.auth || {};
    const agendaApi = appApi.agenda || window.api?.agenda || {};
    const financeApi = appApi.finance || window.api?.finance || {};
    const laboratorioApi = appApi.laboratorio || window.api?.laboratorio || {};
    const servicesApi = appApi.services || window.api?.services || {};
    const patientsApi = appApi.patients || window.api?.patients || {};
    const campanhasApi = appApi.campanhas || window.api?.campanhas || {};
    const plansApi = appApi.plans || window.api?.plans || {};
    const notificationsApi = appApi.notifications || window.api?.notifications || {};

    const userMenuToggle = document.getElementById('user-menu-toggle');
    const attnToggle = document.getElementById('attn-toggle');
    const attnDropdown = document.getElementById('attn-dropdown');
    const gestaoToggle = document.getElementById('gestao-toggle');
    const gestaoDropdown = document.getElementById('gestao-dropdown');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const userNameEl = document.getElementById('user-name');
    const userRoleEl = document.getElementById('user-role');
    const manageItem = userMenuDropdown ? userMenuDropdown.querySelector('[data-action="manage"]') : null;
    let clinicItem = userMenuDropdown ? userMenuDropdown.querySelector('[data-action="clinic"]') : null;
    const changePassItem = userMenuDropdown ? userMenuDropdown.querySelector('[data-action="change-password"]') : null;
    const logoutItem = userMenuDropdown ? userMenuDropdown.querySelector('[data-action="logout"]') : null;
    const notifToggle = document.getElementById('notif-toggle');
    const notifPanel = document.getElementById('notif-panel');
    const notifClose = document.getElementById('notif-close');
    const notifCount = document.getElementById('notif-count');
    const notifSub = document.getElementById('notif-sub');
    const notifBody = document.getElementById('notif-body');
    const notifTabs = Array.from(document.querySelectorAll('.notif-tab'));
    const actionsToggle = document.getElementById('actions-toggle');
    const actionsMenu = document.getElementById('actions-menu');

    const cpModal = document.getElementById('change-password-modal');
    const cpClose = document.getElementById('cp-close');
    const cpCancel = document.getElementById('cp-cancel');
    const cpForm = document.getElementById('cp-form');
    const cpSenhaAtual = document.getElementById('cp-senha-atual');
    const cpNovaSenha = document.getElementById('cp-nova-senha');
    const cpConfirma = document.getElementById('cp-confirma');
    const cpError = document.getElementById('cp-error');

    const cardGestao = document.getElementById('card-gestao-controle');
    const agendaMiniList = document.getElementById('agenda-mini-list');
    const agendaConfirmados = document.getElementById('agenda-confirmados');
    const agendaPendentes = document.getElementById('agenda-pendentes');
    const agendaCancelados = document.getElementById('agenda-cancelados');
    const agendaUpdated = document.getElementById('agenda-mini-updated');
    const agendaRefresh = document.getElementById('agenda-mini-refresh');
    const agendaFilters = Array.from(document.querySelectorAll('.agenda-filter[data-agenda-filter]'));
    const financeMini = document.getElementById('finance-mini');
    const financeChart = document.getElementById('finance-chart');
    const financeReceita = document.getElementById('finance-receita');
    const financeDespesa = document.getElementById('finance-despesa');
    const financeSaldo = document.getElementById('finance-saldo');
    const financeSub = document.getElementById('finance-mini-sub');
    const financeToggle = document.getElementById('finance-visibility');
    const financeRefresh = document.getElementById('finance-mini-refresh');
    const financeFilters = Array.from(document.querySelectorAll('.finance-filter[data-finance-period]'));
    const homeServicosTotal = document.getElementById('home-servicos-total');
    const homeServicosUltimo = document.getElementById('home-servicos-ultimo');
    const homeServicosAndamento = document.getElementById('home-servicos-andamento');
    const homeProntuarioPacientes = document.getElementById('home-prontuario-pacientes');
    const homeProntuarioUltimo = document.getElementById('home-prontuario-ultimo');
    const homeProntuarioAtestados = document.getElementById('home-prontuario-atestados');
    const homeProntuarioUpdated = document.getElementById('home-prontuario-updated');
    const homeAgendaProxima = document.getElementById('home-agenda-proxima');
    const homeAgendaConfirmacoes = document.getElementById('home-agenda-confirmacoes');
    const homeAgendaAlertas = document.getElementById('home-agenda-alertas');
    const homeFinanceReceita = document.getElementById('home-finance-receita');
    const homeFinancePendentes = document.getElementById('home-finance-pendentes');
    const homeFinanceInadimplencia = document.getElementById('home-finance-inadimplencia');
    const homeGestaoMetric1Label = document.getElementById('home-gestao-metric-1-label');
    const homeGestaoMetric2Label = document.getElementById('home-gestao-metric-2-label');
    const homeGestaoMetric3Label = document.getElementById('home-gestao-metric-3-label');
    const homeGestaoCardNote = document.getElementById('home-gestao-card-note');
    const homeGestaoTabs = Array.from(document.querySelectorAll('.home-gestao-tab[data-gestao-view]'));
    const homePlanosAtivos = document.getElementById('home-planos-ativos');
    const homePlanosVencendo = document.getElementById('home-planos-vencendo');
    const homePlanosLiberados = document.getElementById('home-planos-liberados');
    const homePlanosRecebidoMes = document.getElementById('home-planos-recebido-mes');
    const homePlanosInadimplencia = document.getElementById('home-planos-inadimplencia');
    const homePlanosNote = document.getElementById('home-planos-note');
    const homeCampanhasHoje = document.getElementById('home-campanhas-hoje');
    const homeCampanhasResposta = document.getElementById('home-campanhas-resposta');
    const homeCampanhasProximo = document.getElementById('home-campanhas-proximo');
    let currentUser = null;
    let agendaFilter = 'todos';
    let financePeriod = 'mes';
    let agendaCache = [];
    let agendaLoading = false;
    let financeLoading = false;
    let financeCache = null;
    let financeListCache = [];
    let financeRemindersCache = null;
    let financeSyncScheduled = false;
    let homeGestaoView = 'operacional';
    let homeGestaoFinanceData = { receita: 0, pendentes: 0, inadimplencia: 0 };
    let homeGestaoOperacionalData = { estoqueTotal: 0, estoqueCritico: 0, laboratorioPendentes: 0 };
    let notifItems = [];
    let centralNotifItems = [];
    let notifTab = 'geral';
    let notifViewed = false;
    let homeAutoRefreshTimer = null;

    if (cardGestao) {
        const openGestao = () => {
            if (!canManageClinic(currentUser)) return;
            window.location.href = 'gestao.html';
        };
        cardGestao.addEventListener('click', openGestao);
        cardGestao.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                openGestao();
            }
        });
    }

    const setDropdownState = (dropdown, toggle, isOpen) => {
        if (!dropdown) return;
        dropdown.classList.toggle('open', isOpen);
        if (toggle) {
            toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (toggle === actionsToggle) {
                toggle.classList.toggle('is-open', isOpen);
            }
        }
    };

    const closeDropdown = () => {
        setDropdownState(userMenuDropdown, userMenuToggle, false);
        setDropdownState(attnDropdown, attnToggle, false);
        setDropdownState(gestaoDropdown, gestaoToggle, false);
        setDropdownState(actionsMenu, actionsToggle, false);
    };

    const toggleExclusive = (dropdown, toggle) => {
        if (!dropdown) return;
        const isOpen = dropdown.classList.contains('open');
        closeDropdown();
        if (!isOpen) setDropdownState(dropdown, toggle, true);
    };
    const closeNotif = () => {
        if (!notifPanel) return;
        notifPanel.hidden = true;
        notifToggle?.setAttribute('aria-expanded', 'false');
    };

    const setNotificationBadge = (count) => {
        if (!notifCount) return;
        const safeCount = Math.max(0, Number(count) || 0);
        notifCount.textContent = String(safeCount);
        notifCount.hidden = safeCount === 0;
    };

    const markNotificationsViewed = () => {
        notifViewed = true;
        setNotificationBadge(0);
        if (notifSub) notifSub.textContent = 'Voce tem 0 notificacoes novas';
    };

    const toggleNotif = (ev) => {
        ev?.stopPropagation();
        if (!notifPanel || !notifToggle) return;
        const isHidden = notifPanel.hasAttribute('hidden');
        if (isHidden) {
            notifPanel.removeAttribute('hidden');
            notifToggle.setAttribute('aria-expanded', 'true');
            markNotificationsViewed();
        } else {
            closeNotif();
        }
    };

    if (notifToggle) {
        notifToggle.addEventListener('click', toggleNotif);
    }

    if (notifClose) {
        notifClose.addEventListener('click', (ev) => {
            ev.stopPropagation();
            closeNotif();
        });
    }

    if (notifPanel) {
        notifPanel.addEventListener('click', (ev) => ev.stopPropagation());
    }

    notifTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            notifTabs.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            notifTab = tab.dataset.tab || 'geral';
            renderNotifications();
        });
    });
    const toggleDropdown = () => {
        toggleExclusive(userMenuDropdown, userMenuToggle);
    };

    document.addEventListener('click', (ev) => {
        const target = ev.target;
        if (userMenuDropdown && userMenuToggle) {
            if (userMenuDropdown.contains(target) || userMenuToggle.contains(target)) return;
        }
        if (attnDropdown && attnToggle) {
            if (attnDropdown.contains(target) || attnToggle.contains(target)) return;
        }
        if (gestaoDropdown && gestaoToggle) {
            if (gestaoDropdown.contains(target) || gestaoToggle.contains(target)) return;
        }
        if (actionsMenu && actionsToggle) {
            if (actionsMenu.contains(target) || actionsToggle.contains(target)) return;
        }
        if (notifPanel && notifToggle) {
            if (notifPanel.contains(target) || notifToggle.contains(target)) return;
            closeNotif();
        }
        closeDropdown();
    });

    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            closeNotif();
            closeDropdown();
        }
    });

    const openCpModal = () => {
        if (!cpModal) return;
        if (cpError) cpError.textContent = '';
        cpForm?.reset();
        cpModal.classList.add('open');
        cpSenhaAtual?.focus();
    };

    const closeCpModal = () => {
        cpModal?.classList.remove('open');
    };

    cpClose?.addEventListener('click', closeCpModal);
    cpCancel?.addEventListener('click', closeCpModal);

    if (cpForm) {
        cpForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            if (cpError) cpError.textContent = '';
            const senhaAtual = cpSenhaAtual?.value || '';
            const novaSenha = cpNovaSenha?.value || '';
            const confirma = cpConfirma?.value || '';
            if (!senhaAtual || !novaSenha || !confirma) {
                if (cpError) cpError.textContent = 'Preencha todos os campos.';
                return;
            }
            if (novaSenha !== confirma) {
                if (cpError) cpError.textContent = 'Nova senha e confirmacao diferem.';
                return;
            }
            try {
                if (!authApi.changePassword) {
                    throw new Error('Alteracao de senha indisponivel neste ambiente.');
                }
                await authApi.changePassword({ senhaAtual, novaSenha });
                alert('Senha alterada com sucesso.');
                closeCpModal();
            } catch (err) {
                console.error('Erro ao alterar senha', err);
                if (cpError) cpError.textContent = err.message || 'Erro ao alterar senha.';
            }
        });
    }

    const formatRole = (role) => {
        if (!role) return '';
        return role.charAt(0).toUpperCase() + role.slice(1);
    };

    const canManageClinic = (user) => {
        const perfil = String(user?.tipo || user?.perfil || user?.role || '').toLowerCase().trim();
        return (
            user?.isClinicAdmin === true
            || user?.permissions?.admin === true
            || perfil === 'admin'
            || perfil === 'administrativo'
            || perfil === 'super_admin'
            || perfil === 'super-admin'
        );
    };

    const getDisplayName = (user = {}) => {
        const rawName = String(user?.nome || '').trim();
        if (rawName) {
            const normalizedName = rawName
                .replace(/\s[-–—]\s[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
                .replace(/([._-])[a-z0-9]{8,}$/i, '')
                .trim();
            return normalizedName || rawName;
        }

        const rawLogin = String(user?.email || user?.login || '').trim();
        if (!rawLogin) return 'Usuario';
        const localPart = rawLogin.split('@')[0] || '';
        return localPart.replace(/[._-]+/g, ' ').trim() || 'Usuario';
    };


    const normalizeDateLocal = (value) => {
        if (!value) return '';
        const format = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        if (value instanceof Date) return format(value);
        const raw = String(value).trim();
        const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
            const [, y, m, d] = isoMatch;
            return format(new Date(Number(y), Number(m) - 1, Number(d)));
        }
        const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (brMatch) {
            const [, d, m, y] = brMatch;
            return format(new Date(Number(y), Number(m) - 1, Number(d)));
        }
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return '';
        return format(parsed);
    };

    const filtrarAgendamentosPorPerfil = (agendamentos, usuario) => {
        if (!usuario) return [];
        const perfil = String(usuario.tipo || usuario.perfil || usuario.role || '').toLowerCase().trim();
        const usuarioId = usuario.id || usuario.dentistaId || usuario.userId || '';
        const isClinicAdmin =
            usuario.isClinicAdmin === true
            || perfil === 'admin'
            || perfil === 'administrativo'
            || perfil === 'super_admin'
            || perfil === 'super-admin'
            || perfil === 'recepcao'
            || perfil === 'recepcionista';
        if (isClinicAdmin) {
            return agendamentos || [];
        }
        if (perfil === 'dentista' || perfil === 'dentist') {
            return (agendamentos || []).filter(
                (ag) => String(ag.dentistaId || '') === String(usuarioId)
            );
        }
        return [];
    };

    const formatUpdated = () => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `Ultima atualizacao as ${hh}:${mm}`;
    };

    const setMetricValue = (el, value, muted = false) => {
        if (!el) return;
        el.textContent = value;
        el.classList.toggle('is-muted', muted);
    };

    const formatHour = (value) => {
        if (!value) return '--:--';
        const parts = String(value).split(':');
        if (parts.length < 2) return '--:--';
        const hh = String(parts[0]).padStart(2, '0');
        const mm = String(parts[1]).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    const formatPercent = (value) => {
        const v = Number(value);
        if (!Number.isFinite(v)) return '0%';
        return `${Math.round(v)}%`;
    };

    const statusLabel = {
        em_aberto: 'Nao confirmado',
        confirmado: 'Confirmado',
        realizado: 'Realizado',
        nao_compareceu: 'Nao compareceu',
        cancelado: 'Cancelado',
    };

    const renderAgendaMini = (agendamentos) => {
        if (!agendaMiniList) return;
        if (!agendamentos || !agendamentos.length) {
            agendaMiniList.innerHTML = '<div class="agenda-mini-empty">Nenhum agendamento para hoje.</div>';
            if (agendaConfirmados) agendaConfirmados.textContent = '0';
            if (agendaPendentes) agendaPendentes.textContent = '0';
            if (agendaCancelados) agendaCancelados.textContent = '0';
            return;
        }
        const confirmados = agendamentos.filter((a) => (a.status || 'em_aberto') === 'confirmado');
        const pendentes = agendamentos.filter((a) => (a.status || 'em_aberto') === 'em_aberto');
        const cancelados = agendamentos.filter((a) => (a.status || 'em_aberto') === 'cancelado');
        if (agendaConfirmados) agendaConfirmados.textContent = String(confirmados.length);
        if (agendaPendentes) agendaPendentes.textContent = String(pendentes.length);
        if (agendaCancelados) agendaCancelados.textContent = String(cancelados.length);

        const filtrados = agendamentos.filter((a) => {
            if (agendaFilter === 'confirmado') return (a.status || 'em_aberto') === 'confirmado';
            if (agendaFilter === 'em_aberto') return (a.status || 'em_aberto') === 'em_aberto';
            if (agendaFilter === 'cancelado') return (a.status || 'em_aberto') === 'cancelado';
            return true;
        });

        if (!filtrados.length) {
            agendaMiniList.innerHTML = '<div class="agenda-mini-empty">Nenhum agendamento neste filtro.</div>';
            return;
        }

        const nowMinutes = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
        const toMinutes = (val) => {
            if (!val || typeof val !== 'string') return null;
            const parts = val.split(':');
            if (parts.length < 2) return null;
            const h = Number(parts[0]);
            const m = Number(parts[1]);
            if (Number.isNaN(h) || Number.isNaN(m)) return null;
            return h * 60 + m;
        };

        const fragment = document.createDocumentFragment();
        filtrados.forEach((a) => {
            const statusKey = a.status || 'em_aberto';
            const item = document.createElement('div');
            const fimMin = toMinutes(a.horaFim) ?? toMinutes(a.horaInicio);
            const overdue = statusKey === 'em_aberto' && fimMin !== null && fimMin < nowMinutes;
            item.className = `agenda-mini-item status-${statusKey}${overdue ? ' is-overdue' : ''}`;
            const horario = `${a.horaInicio || '--:--'}${a.horaFim ? ' - ' + a.horaFim : ''}`;
            const paciente = a.pacienteNome || a.paciente || 'Paciente';
            const tipo = a.tipo || 'Procedimento';
            const confirmBtn = '';
            item.innerHTML = `
                <div class="agenda-mini-time">${horario}</div>
                <div>
                    <div class="agenda-mini-patient">${paciente}</div>
                    <div class="agenda-mini-proc">${tipo}</div>
                </div>
                <div class="agenda-mini-actions">
                    <span class="agenda-mini-status">${statusLabel[statusKey] || statusKey}</span>
                    ${confirmBtn}
                </div>
            `;
            fragment.appendChild(item);
        });
        agendaMiniList.replaceChildren(fragment);
    };

    const updateHomeAgendaPanel = (agendamentos) => {
        if (!homeAgendaProxima && !homeAgendaConfirmacoes && !homeAgendaAlertas) return;
        const list = Array.isArray(agendamentos) ? agendamentos : [];
        if (!list.length) {
            setMetricValue(homeAgendaProxima, '--:--', true);
            setMetricValue(homeAgendaConfirmacoes, '0%', true);
            setMetricValue(homeAgendaAlertas, '0', true);
            try {
                console.info('[HOME] management_widget_loaded', JSON.stringify({
                    widget: 'home-agenda',
                    management_widget_source: 'agenda-get-day',
                    management_widget_metric: 'proxima_consulta|confirmacoes|alertas',
                    management_widget_zero_reason: 'no_data',
                }));
            } catch (_) {}
            return;
        }
        const confirmados = list.filter((a) => (a.status || 'em_aberto') === 'confirmado');
        const pendentes = list.filter((a) => (a.status || 'em_aberto') === 'em_aberto');
        const total = list.length;
        const pct = total ? (confirmados.length / total) * 100 : 0;

        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const toMinutes = (val) => {
            if (!val || typeof val !== 'string') return null;
            const parts = val.split(':');
            if (parts.length < 2) return null;
            const h = Number(parts[0]);
            const m = Number(parts[1]);
            if (Number.isNaN(h) || Number.isNaN(m)) return null;
            return h * 60 + m;
        };
        const ativos = list.filter((a) => (a.status || 'em_aberto') !== 'cancelado');
        const proximos = ativos
            .map((a) => ({
                item: a,
                startMin: toMinutes(a.horaInicio),
            }))
            .filter((entry) => entry.startMin !== null);
        const futuro = proximos.find((entry) => entry.startMin >= nowMinutes);
        const proximo = futuro?.item || proximos[0]?.item || ativos[0] || list[0];
        const alertas = pendentes.filter((a) => {
            const fimMin = toMinutes(a.horaFim) ?? toMinutes(a.horaInicio);
            return fimMin !== null && fimMin < nowMinutes;
        }).length;

        setMetricValue(homeAgendaProxima, formatHour(proximo?.horaInicio), false);
        setMetricValue(homeAgendaConfirmacoes, formatPercent(pct), false);
        setMetricValue(homeAgendaAlertas, String(alertas), alertas === 0);
        try {
            console.info('[HOME] management_widget_loaded', JSON.stringify({
                widget: 'home-agenda',
                management_widget_source: 'agenda-get-day',
                management_widget_metric: 'proxima_consulta|confirmacoes|alertas',
                management_widget_zero_reason: '',
            }));
        } catch (_) {}
    };
    const renderNotifications = () => {
        if (!notifBody) return;
        const items = notifTab === 'geral'
            ? notifItems
            : notifItems.filter((item) => item.type === notifTab);

        if (!items.length) {
            notifBody.innerHTML = `
                <div class="notif-empty">
                    <div class="notif-empty-icon" aria-hidden="true">&#128269;</div>
                    <div>Voce nao tem notificacoes</div>
                </div>
            `;
            return;
        }

        const html = items.map((item) => `
            <div class="notif-item">
                <div>
                    <h4>${item.title}</h4>
                    <p>${item.description}</p>
                </div>
                <span class="notif-tag">${item.tag}</span>
            </div>
        `).join('');

        notifBody.innerHTML = `<div class="notif-list">${html}</div>`;
    };

    const buildAgendaNotifications = (agendamentos) => {
        const allowed = new Set(['confirmado', 'cancelado', 'nao_compareceu']);
        const hoje = normalizeDateLocal(new Date());
        const nowMinutes = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
        const toMinutes = (val) => {
            if (!val || typeof val !== 'string') return null;
            const parts = val.split(':');
            if (parts.length < 2) return null;
            const h = Number(parts[0]);
            const m = Number(parts[1]);
            if (Number.isNaN(h) || Number.isNaN(m)) return null;
            return h * 60 + m;
        };

        const normal = (agendamentos || [])
            .filter((a) => allowed.has(a.status || ''))
            .map((a) => {
                const statusKey = a.status || 'em_aberto';
                const paciente = a.pacienteNome || a.paciente || 'Paciente';
                const horario = `${a.horaInicio || '--:--'}${a.horaFim ? ' - ' + a.horaFim : ''}`;
                const tipo = a.tipo || 'Consulta';
                let title = 'Atualizacao da agenda';
                if (statusKey === 'confirmado') title = 'Consulta confirmada';
                if (statusKey === 'cancelado') title = 'Consulta cancelada';
                if (statusKey === 'nao_compareceu') title = 'Nao compareceu';
                const description = `${paciente} - ${tipo} - ${horario}`;
                return {
                    type: 'agenda',
                    title,
                    description,
                    tag: statusLabel[statusKey] || statusKey,
                };
            });

        const atrasos = (agendamentos || [])
            .filter((a) => {
                const data = normalizeDateLocal(a.data || hoje);
                if (data !== hoje) return false;
                const statusKey = a.status || 'em_aberto';
                if (statusKey !== 'em_aberto') return false;
                const fimMin = toMinutes(a.horaFim) ?? toMinutes(a.horaInicio);
                return fimMin !== null && fimMin < nowMinutes;
            })
            .map((a) => {
                const paciente = a.pacienteNome || a.paciente || 'Paciente';
                const horario = `${a.horaInicio || '--:--'}${a.horaFim ? ' - ' + a.horaFim : ''}`;
                const tipo = a.tipo || 'Consulta';
                return {
                    type: 'agenda',
                    title: 'Agendamento em atraso',
                    description: `${paciente} - ${tipo} - ${horario}`,
                    tag: 'Atraso',
                };
            });

        return [...atrasos, ...normal];
    };
    const normalizeFinanceStatus = (entry) => {
        const raw = String(entry?.paymentStatus || entry?.status || '').trim().toLowerCase();
        if (!raw) return '';
        if (raw === 'paid' || raw === 'pago') return 'pago';
        if (raw === 'pending' || raw === 'pendente' || raw === 'em_aberto' || raw === 'aberto' || raw === 'aguardando') return 'pendente';
        if (raw === 'cancelled' || raw === 'cancelado') return 'cancelado';
        return raw;
    };

    const buildFinanceNotifications = (reminders) => {
        const overdue = reminders?.overdue || { count: 0, totalAmount: 0, items: [] };
        const dueToday = reminders?.dueToday || { count: 0, totalAmount: 0, items: [] };
        const dueSoon = reminders?.dueSoon || { count: 0, totalAmount: 0, items: [] };
        const partialOutstanding = reminders?.partialOutstanding || { count: 0, totalAmount: 0, items: [] };
        const items = [];
        const appendSamples = (group, tag, title) => {
            (Array.isArray(group?.items) ? group.items : []).slice(0, 2).forEach((entry) => {
                const who = entry?.patientName || entry?.description || 'Recebivel';
                const due = entry?.dueDate ? ` • ${entry.dueDate}` : '';
                items.push({
                    type: 'financeiro',
                    title,
                    description: `${who}${due} • ${formatCurrency(entry?.remainingAmount || 0)}`,
                    tag,
                });
            });
        };
        if (overdue.count > 0) {
            items.push({
                type: 'financeiro',
                title: 'Recebiveis em atraso',
                description: `${overdue.count} item(ns) em atraso • ${formatCurrency(overdue.totalAmount)}`,
                tag: 'Atraso',
            });
            appendSamples(overdue, 'Atraso', 'Cobrar atraso');
        }
        if (dueToday.count > 0) {
            items.push({
                type: 'financeiro',
                title: 'Recebiveis vencem hoje',
                description: `${dueToday.count} item(ns) • ${formatCurrency(dueToday.totalAmount)}`,
                tag: 'Hoje',
            });
            appendSamples(dueToday, 'Hoje', 'Vence hoje');
        }
        if (dueSoon.count > 0) {
            items.push({
                type: 'financeiro',
                title: 'Recebiveis proximos do vencimento',
                description: `${dueSoon.count} item(ns) em ate 3 dias • ${formatCurrency(dueSoon.totalAmount)}`,
                tag: '3 dias',
            });
            appendSamples(dueSoon, '3 dias', 'Vence em breve');
        }
        if (partialOutstanding.count > 0) {
            items.push({
                type: 'financeiro',
                title: 'Saldos parciais pendentes',
                description: `${partialOutstanding.count} conta(s) parcial(is) • ${formatCurrency(partialOutstanding.totalAmount)}`,
                tag: 'Parcial',
            });
            appendSamples(partialOutstanding, 'Parcial', 'Saldo restante');
        }
        return items;
    };

    const buildCentralNotifications = (events) => {
        return (Array.isArray(events) ? events : []).map((event) => {
            const type = String(event?.type || '').trim().toUpperCase();
            const createdAt = String(event?.createdAt || '').trim();
            const phone = String(event?.phone || '').trim();
            const payload = event?.payload || {};
            let title = 'Atualizacao via WhatsApp';
            let description = `${phone ? `Paciente ${phone}` : 'Paciente'} respondeu pelo WhatsApp.`;
            let tag = 'WhatsApp';

            if (type === 'APPOINTMENT_CONFIRMED') {
                title = 'Consulta confirmada no WhatsApp';
                description = `${phone ? `Paciente ${phone}` : 'Paciente'} confirmou a consulta.`;
                tag = 'Confirmado';
            } else if (type === 'APPOINTMENT_RESCHEDULE_REQUESTED') {
                title = 'Remarcacao solicitada no WhatsApp';
                description = `${phone ? `Paciente ${phone}` : 'Paciente'} pediu remarcacao.`;
                tag = 'Remarcar';
            } else if (type === 'APPOINTMENT_REMINDER_SENT') {
                title = 'Lembrete enviado no WhatsApp';
                description = `${phone ? `Paciente ${phone}` : 'Paciente'} recebeu lembrete de consulta.`;
                tag = 'Lembrete';
            }

            if (payload?.nextStatus && type !== 'APPOINTMENT_REMINDER_SENT') {
                description = `${description} Status: ${String(payload.nextStatus).trim()}.`;
            }

            if (createdAt) {
                const stamp = new Date(createdAt);
                if (!Number.isNaN(stamp.getTime())) {
                    description = `${description} ${stamp.toLocaleString('pt-BR')}`;
                }
            }

            return {
                type: 'agenda',
                title,
                description,
                tag,
            };
        });
    };

    const refreshNotifications = () => {
        const agendaItems = buildAgendaNotifications(agendaCache);
        const financeItems = buildFinanceNotifications(financeRemindersCache);
        notifItems = [...centralNotifItems, ...agendaItems, ...financeItems];
        setNotificationBadge(notifViewed ? 0 : notifItems.length);
        if (notifSub) {
            const visibleCount = notifViewed ? 0 : notifItems.length;
            notifSub.textContent = `Voce tem ${visibleCount} notificacoes novas`;
        }
        renderNotifications();
    };

    const loadCentralNotificationEvents = async () => {
        if (typeof notificationsApi.listEvents !== 'function') {
            centralNotifItems = [];
            refreshNotifications();
            return;
        }

        try {
            const events = await notificationsApi.listEvents({ limit: 12 });
            centralNotifItems = buildCentralNotifications(events);
        } catch (err) {
            console.warn('[HOME] nao foi possivel carregar eventos centrais de notificacao', err);
            centralNotifItems = [];
        }

        refreshNotifications();
    };

    const updateAgendaFilterButtons = (filter) => {
        agendaFilters.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.agendaFilter === filter);
        });
    };

    const applyAgendaFilter = (filter) => {
        agendaFilter = filter || 'todos';
        updateAgendaFilterButtons(agendaFilter);
        renderAgendaMini(agendaCache);
    };

    const setAgendaLoading = (loading) => {
        agendaLoading = loading;
        if (agendaRefresh) {
            agendaRefresh.disabled = loading;
            agendaRefresh.setAttribute('aria-busy', loading ? 'true' : 'false');
        }
    };

    const loadAgendaMini = async () => {
        if (!agendaMiniList || !agendaApi.getDay) return;
        if (agendaLoading) return;
        setAgendaLoading(true);
        try {
            const usuario = currentUser || await authApi.currentUser?.();
            if (!usuario) return;
            currentUser = usuario;
            const hoje = normalizeDateLocal(new Date());
            const raw = await agendaApi.getDay(hoje);
            const ags = filtrarAgendamentosPorPerfil(raw || [], usuario);
            const ordenados = ags.slice().sort((a, b) => String(a.horaInicio || '').localeCompare(String(b.horaInicio || '')));
            agendaCache = ordenados;
            renderAgendaMini(agendaCache);
            updateHomeAgendaPanel(agendaCache);
            refreshNotifications();
            if (agendaUpdated) agendaUpdated.textContent = formatUpdated();
        } catch (err) {
            console.warn('[HOME] nao foi possivel carregar agenda do dia', err);
            agendaCache = [];
            refreshNotifications();
            if (agendaMiniList) {
                agendaMiniList.innerHTML = '<div class="agenda-mini-empty">Nao foi possivel carregar a agenda. <button class="agenda-mini-retry" type="button" data-action="retry-agenda">Tentar novamente</button></div>';
            }
            updateHomeAgendaPanel([]);
        } finally {
            setAgendaLoading(false);
        }
    };


    const formatCurrency = (value) => {
        const v = Number(value) || 0;
        return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const setFinanceHidden = (hidden) => {
        if (!financeMini) return;
        financeMini.classList.toggle('is-hidden', hidden);
        if (financeToggle) financeToggle.textContent = hidden ? 'Ver' : 'Ocultar';
        try {
            localStorage.setItem('home-finance-hidden', hidden ? '1' : '0');
        } catch (_) {
        }
    };

    const loadFinanceHidden = () => {
        try {
            return localStorage.getItem('home-finance-hidden') === '1';
        } catch (_) {
            return false;
        }
    };

    const updateFinanceChart = (receitas, despesas) => {
        if (!financeChart) return;
        const total = Math.max(receitas + despesas, 1);
        const pct = Math.max(0, Math.min(1, receitas / total));
        const deg = Math.round(pct * 360);
        financeChart.style.setProperty('--finance-fill', deg + 'deg');
    };

    const financePeriodMap = {
        dia: 'hoje',
        semana: 'semana',
        mes: 'mes',
    };

    const financePeriodLabel = {
        dia: 'Hoje',
        semana: 'Semana',
        mes: 'Mes',
    };
    const normalizeFinanceEntryType = (entry) => {
        const raw = String(entry?.tipo || entry?.type || '').trim().toLowerCase();
        if (raw === 'despesa' || raw === 'expense') return 'despesa';
        return 'receita';
    };
    const normalizeFinanceDate = (value) => {
        const raw = normalizeDateLocal(value);
        return raw ? new Date(`${raw}T00:00:00`) : null;
    };
    const isFinanceDateInPeriod = (date, period) => {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
        const now = new Date();
        const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (period === 'dia') {
            return date.getFullYear() === startDay.getFullYear()
                && date.getMonth() === startDay.getMonth()
                && date.getDate() === startDay.getDate();
        }
        if (period === 'semana') {
            const startWeek = new Date(startDay);
            const weekday = startWeek.getDay();
            const adjust = weekday === 0 ? -6 : 1 - weekday;
            startWeek.setDate(startWeek.getDate() + adjust);
            const endWeek = new Date(startWeek);
            endWeek.setDate(startWeek.getDate() + 7);
            return date >= startWeek && date < endWeek;
        }
        return date.getFullYear() === startDay.getFullYear() && date.getMonth() === startDay.getMonth();
    };
    const getFinanceReceivedAmount = (entry) => {
        const paidAmount = Number(entry?.paidAmount);
        if (Number.isFinite(paidAmount) && paidAmount > 0) return paidAmount;
        const status = String(entry?.paymentStatus || entry?.status || '').trim().toLowerCase();
        if (status === 'paid' || status === 'pago') return Number(entry?.valor ?? entry?.totalAmount ?? 0) || 0;
        return 0;
    };
    const getFinancePendingAmount = (entry) => {
        const remaining = Number(entry?.remainingAmount);
        if (Number.isFinite(remaining) && remaining >= 0) return remaining;
        return Number(entry?.valor ?? entry?.totalAmount ?? 0) || 0;
    };
    const getFinanceEntryDate = (entry) => {
        if (normalizeFinanceEntryType(entry) === 'despesa') {
            return normalizeFinanceDate(entry?.data || entry?.createdAt);
        }
        return normalizeFinanceDate(entry?.paidAt || entry?.data || entry?.createdAt);
    };
    const buildHomeFinanceSummaryFromList = (rows = [], period = 'mes') => {
        let receitas = 0;
        let despesas = 0;
        let pendentes = 0;
        let inadimplencia = 0;
        const today = new Date();
        const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        (Array.isArray(rows) ? rows : []).forEach((entry) => {
            const type = normalizeFinanceEntryType(entry);
            if (type === 'receita') {
                const receivedDate = getFinanceEntryDate(entry);
                if (receivedDate && isFinanceDateInPeriod(receivedDate, period)) {
                    receitas += getFinanceReceivedAmount(entry);
                }
                const dueDate = normalizeFinanceDate(entry?.dueDate || entry?.vencimento || entry?.data);
                const pendingAmount = getFinancePendingAmount(entry);
                const status = String(entry?.paymentStatus || entry?.status || '').trim().toLowerCase();
                const isPending = pendingAmount > 0 && status !== 'paid' && status !== 'pago' && status !== 'cancelled' && status !== 'cancelado';
                if (isPending && dueDate && isFinanceDateInPeriod(dueDate, period)) {
                    pendentes += pendingAmount;
                    if (dueDate < startToday) inadimplencia += pendingAmount;
                }
                return;
            }
            const expenseDate = getFinanceEntryDate(entry);
            if (expenseDate && isFinanceDateInPeriod(expenseDate, period)) {
                despesas += Number(entry?.valor ?? entry?.totalAmount ?? 0) || 0;
            }
        });
        return { receitas, despesas, saldo: receitas - despesas, pendentes, inadimplencia };
    };

    const updateFinanceFilterButtons = (period) => {
        financeFilters.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.financePeriod === period);
        });
    };

    const renderFinanceMini = () => {
        const currentPeriod = financePeriod || 'mes';
        const listBlock = buildHomeFinanceSummaryFromList(financeListCache, currentPeriod);
        const monthlySummary = financeCache?.monthlySummary || null;
        const legacyKey = financePeriodMap[currentPeriod] || 'mes';
        const legacyBlock = financeCache?.[legacyKey] || null;
        const hasListData = Boolean(
            listBlock.receitas
            || listBlock.despesas
            || listBlock.pendentes
            || listBlock.inadimplencia
        );
        let bloco = listBlock;
        if (!hasListData && legacyBlock) {
            bloco = legacyBlock;
        } else if (!hasListData && currentPeriod === 'mes' && monthlySummary) {
            bloco = {
                receitas: Number(monthlySummary?.totalReceived) || Number(monthlySummary?.totalRevenue) || 0,
                despesas: Number(monthlySummary?.totalExpenses) || 0,
                saldo: Number(monthlySummary?.saldo) || ((Number(monthlySummary?.totalReceived) || Number(monthlySummary?.totalRevenue) || 0) - (Number(monthlySummary?.totalExpenses) || 0)),
            };
        }
        const receitas = Number(bloco.receitas) || 0;
        const despesas = Number(bloco.despesas) || 0;
        const saldo = Number(bloco.saldo) || receitas - despesas;
        if (financeReceita) financeReceita.textContent = formatCurrency(receitas);
        if (financeDespesa) financeDespesa.textContent = formatCurrency(despesas);
        if (financeSaldo) financeSaldo.textContent = formatCurrency(saldo);
        if (financeSub) {
            const label = financePeriodLabel[currentPeriod] || 'Mes';
            const labelText = currentPeriod === 'dia'
                ? 'hoje'
                : currentPeriod === 'semana'
                    ? 'na semana'
                    : 'no mes';
            if (receitas || despesas) {
                financeSub.textContent = label;
            } else if ((Number(bloco.pendentes) || 0) > 0 || (Number(bloco.inadimplencia) || 0) > 0) {
                financeSub.textContent = `A receber ${labelText}: ${formatCurrency(Number(bloco.pendentes) || 0)}`;
            } else {
                financeSub.textContent = `Sem lancamentos ${labelText}`;
            }
        }
        if (financeChart) {
            financeChart.setAttribute('aria-label', `Resumo financeiro de ${String(financePeriodLabel[currentPeriod] || 'Mes').toLowerCase()}`);
        }
        updateFinanceChart(receitas, despesas);
    };

    const setFinanceLoading = (loading) => {
        financeLoading = loading;
        if (financeRefresh) {
            financeRefresh.disabled = loading;
            financeRefresh.setAttribute('aria-busy', loading ? 'true' : 'false');
        }
    };

    const loadFinanceMini = async () => {
        if (!financeMini) return;
        const canLoadDashboard = typeof financeApi.getDashboard === 'function';
        const canLoadList = typeof financeApi.list === 'function';
        const canLoadReminders = typeof financeApi.getReminders === 'function';
        if (!canLoadDashboard && !canLoadList && !canLoadReminders) return;
        if (financeLoading) return;
        setFinanceLoading(true);
        try {
            const [dashResult, remindersResult, listResult] = await Promise.allSettled([
                canLoadDashboard ? financeApi.getDashboard() : Promise.resolve(null),
                canLoadReminders ? financeApi.getReminders() : Promise.resolve(null),
                canLoadList ? financeApi.list() : Promise.resolve([]),
            ]);
            financeCache = dashResult.status === 'fulfilled' ? (dashResult.value || null) : null;
            financeListCache = listResult.status === 'fulfilled' && Array.isArray(listResult.value) ? listResult.value : [];
            financeRemindersCache = remindersResult.status === 'fulfilled' ? (remindersResult.value || null) : null;
            renderFinanceMini();
            updateHomeFinancePanel(financeCache, financeRemindersCache, financeListCache);
            refreshNotifications();
        } catch (err) {
            console.warn('[HOME] nao foi possivel carregar controle financeiro', err);
            financeCache = null;
            financeListCache = [];
            financeRemindersCache = null;
            refreshNotifications();
            if (financeSub) financeSub.textContent = 'Sem acesso';
            if (financeReceita) financeReceita.textContent = formatCurrency(0);
            if (financeDespesa) financeDespesa.textContent = formatCurrency(0);
            if (financeSaldo) financeSaldo.textContent = formatCurrency(0);
            updateFinanceChart(0, 0);
            updateHomeFinancePanel(null, null, []);
        } finally {
            setFinanceLoading(false);
        }
    };

    const startHomeAutoRefresh = () => {
        if (homeAutoRefreshTimer) clearInterval(homeAutoRefreshTimer);
        homeAutoRefreshTimer = setInterval(() => {
            if (document.hidden) return;
            void loadAgendaMini();
            void loadFinanceMini();
            void loadCentralNotificationEvents();
        }, 30000);
    };

    const updateHomeFinancePanel = (dash, reminders = null, list = []) => {
        if (!homeFinanceReceita && !homeFinancePendentes && !homeFinanceInadimplencia) return;
        const computed = buildHomeFinanceSummaryFromList(list, 'mes');
        const monthlySummary = dash?.monthlySummary || null;
        const listHasData = computed.receitas || computed.pendentes || computed.inadimplencia || computed.despesas;
        homeGestaoFinanceData.receita = listHasData ? computed.receitas : (Number(monthlySummary?.totalReceived) || Number(monthlySummary?.totalRevenue) || Number(dash?.totalPaidAmount) || 0);
        homeGestaoFinanceData.pendentes = listHasData ? computed.pendentes : (Number(monthlySummary?.totalPending) || Number(reminders?.dueToday?.totalAmount || 0) + Number(reminders?.dueSoon?.totalAmount || 0) + Number(reminders?.partialOutstanding?.totalAmount || 0));
        homeGestaoFinanceData.inadimplencia = listHasData ? computed.inadimplencia : (Number(monthlySummary?.totalOverdue) || Number(reminders?.overdue?.totalAmount || 0));
        try {
            console.info('[HOME] management_widget_loaded', JSON.stringify({
                widget: 'home-gestao-financeiro',
                management_widget_source: listHasData ? 'finance-list' : 'dashboard|reminders',
                management_widget_metric: 'receita_recebida|a_receber|em_atraso',
                management_widget_zero_reason: (homeGestaoFinanceData.receita || homeGestaoFinanceData.pendentes || homeGestaoFinanceData.inadimplencia) ? '' : 'no_data',
            }));
        } catch (_) {}
        renderHomeGestaoCard();
    };

    const scheduleHomeFinanceSync = () => {
        if (financeSyncScheduled) return;
        financeSyncScheduled = true;
        setTimeout(() => {
            financeSyncScheduled = false;
            loadFinanceMini();
            updateHomePlansPanel();
        }, 150);
    };

    const readHomeStockMetrics = () => {
        const storageKey = 'voithos_estoque_produtos_v1';
        try {
            const raw = localStorage.getItem(storageKey);
            const list = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(list)) return { estoqueTotal: 0, estoqueCritico: 0 };
            const estoqueTotal = list.length;
            const estoqueCritico = list.filter((item) => {
                const atual = Number(item?.estoqueAtual) || 0;
                return atual <= 0;
            }).length;
            return { estoqueTotal, estoqueCritico };
        } catch (_err) {
            return { estoqueTotal: 0, estoqueCritico: 0 };
        }
    };

    const loadHomeOperationalPanel = async () => {
        const stock = readHomeStockMetrics();
        homeGestaoOperacionalData.estoqueTotal = stock.estoqueTotal;
        homeGestaoOperacionalData.estoqueCritico = stock.estoqueCritico;

        if (laboratorioApi.getDashboard) {
            try {
                const dash = await laboratorioApi.getDashboard();
                homeGestaoOperacionalData.laboratorioPendentes = Number(dash?.pendentes) || 0;
            } catch (_err) {
                homeGestaoOperacionalData.laboratorioPendentes = 0;
            }
        } else {
            homeGestaoOperacionalData.laboratorioPendentes = 0;
        }
        renderHomeGestaoCard();
    };

    const renderHomeGestaoCard = () => {
        if (!homeFinanceReceita || !homeFinancePendentes || !homeFinanceInadimplencia) return;
        if (homeGestaoView === 'operacional') {
            if (homeGestaoMetric1Label) homeGestaoMetric1Label.textContent = 'Itens em estoque';
            if (homeGestaoMetric2Label) homeGestaoMetric2Label.textContent = 'Estoque critico';
            if (homeGestaoMetric3Label) homeGestaoMetric3Label.textContent = 'Lab pendente';
            if (homeGestaoCardNote) homeGestaoCardNote.textContent = 'Operacional';
            setMetricValue(homeFinanceReceita, String(homeGestaoOperacionalData.estoqueTotal || 0), (homeGestaoOperacionalData.estoqueTotal || 0) === 0);
            setMetricValue(homeFinancePendentes, String(homeGestaoOperacionalData.estoqueCritico || 0), (homeGestaoOperacionalData.estoqueCritico || 0) === 0);
            setMetricValue(homeFinanceInadimplencia, String(homeGestaoOperacionalData.laboratorioPendentes || 0), (homeGestaoOperacionalData.laboratorioPendentes || 0) === 0);
            return;
        }
        if (homeGestaoMetric1Label) homeGestaoMetric1Label.textContent = 'Faturamento do mes';
        if (homeGestaoMetric2Label) homeGestaoMetric2Label.textContent = 'Pendente do mes';
        if (homeGestaoMetric3Label) homeGestaoMetric3Label.textContent = 'Em atraso';
        if (homeGestaoCardNote) homeGestaoCardNote.textContent = 'Mes atual';
        setMetricValue(homeFinanceReceita, formatCurrency(homeGestaoFinanceData.receita || 0), false);
        setMetricValue(homeFinancePendentes, formatCurrency(homeGestaoFinanceData.pendentes || 0), (homeGestaoFinanceData.pendentes || 0) === 0);
        setMetricValue(homeFinanceInadimplencia, formatCurrency(homeGestaoFinanceData.inadimplencia || 0), (homeGestaoFinanceData.inadimplencia || 0) === 0);
    };

    const extractServiceDate = (service) => {
        const raw = service?.data || service?.dataAtendimento || service?.registeredAt || service?.createdAt || '';
        if (!raw) return null;
        const d = new Date(String(raw));
        if (!Number.isNaN(d.getTime())) return d;
        const parsed = normalizeDateLocal(raw);
        return parsed ? new Date(`${parsed}T00:00:00`) : null;
    };
    const normalizeHomeServiceStatus = (value) => {
        const key = String(value || '').trim().toLowerCase();
        if (['realizado', 'feito', 'concluido', 'concluído'].includes(key)) return 'realizado';
        if (['pre-existente', 'preexistente', 'pré-existente', 'pre existente'].includes(key)) return 'pre-existente';
        return 'a-realizar';
    };
    const normalizeHomePaymentStatus = (service = {}) => {
        const raw = String(service?.financeiro?.paymentStatus || service?.paymentStatus || '').trim().toUpperCase();
        if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
        if (raw === 'CANCELLED' || raw === 'CANCELADO') return 'CANCELLED';
        return 'PENDING';
    };
    const isHomeServiceInProgress = (service = {}) => {
        const procStatus = normalizeHomeServiceStatus(service.status || service.estado || service.situacao);
        const paymentStatus = normalizeHomePaymentStatus(service);
        if (procStatus === 'pre-existente') return false;
        if (paymentStatus === 'CANCELLED') return false;
        return procStatus !== 'realizado';
    };

    const formatDateShort = (date) => {
        if (!date || Number.isNaN(date.getTime())) return '--';
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}`;
    };

    const updateHomeServicesPanel = async () => {
        if (!servicesApi.listAll) {
            setMetricValue(homeServicosTotal, '0', true);
            setMetricValue(homeServicosUltimo, '--', true);
            setMetricValue(homeServicosAndamento, '0', true);
            return;
        }
        try {
            const list = await servicesApi.listAll();
            const total = Array.isArray(list) ? list.length : 0;
            const andamento = (list || []).filter((s) => isHomeServiceInProgress(s)).length;
            const lastDate = (list || [])
                .map(extractServiceDate)
                .filter(Boolean)
                .sort((a, b) => b - a)[0];

            setMetricValue(homeServicosTotal, String(total), total === 0);
            setMetricValue(homeServicosUltimo, formatDateShort(lastDate), !lastDate);
            setMetricValue(homeServicosAndamento, String(andamento), andamento === 0);
            try {
                console.info('[HOME] management_widget_loaded', JSON.stringify({
                    widget: 'home-servicos',
                    management_widget_source: 'services-list-all',
                    management_widget_metric: 'procedimentos|ultimo_atendimento|em_andamento',
                    management_widget_zero_reason: (total || andamento || lastDate) ? '' : 'no_data',
                }));
            } catch (_) {}
        } catch (err) {
            console.warn('[HOME] nao foi possivel carregar servicos', err);
            setMetricValue(homeServicosTotal, '0', true);
            setMetricValue(homeServicosUltimo, '--', true);
            setMetricValue(homeServicosAndamento, '0', true);
        }
    };

    const updateHomeProntuarioPanel = async () => {
        if (!patientsApi.list) {
            setMetricValue(homeProntuarioPacientes, '0', true);
            setMetricValue(homeProntuarioUltimo, '--', true);
            setMetricValue(homeProntuarioAtestados, '0', true);
            if (homeProntuarioUpdated) homeProntuarioUpdated.textContent = 'Sem acesso';
            return;
        }
        try {
            const [list, services] = await Promise.all([
                patientsApi.list(),
                servicesApi.listAll ? servicesApi.listAll().catch(() => []) : Promise.resolve([]),
            ]);
            const total = Array.isArray(list) ? list.length : 0;
            try {
                console.info('[HOME] patient_index_count_loaded', JSON.stringify({
                    count: total,
                    ids: (list || []).map((p) => String(p?.id || '').trim()).filter(Boolean),
                    prontuarios: (list || []).map((p) => String(p?.prontuario || p?.id || '').trim()).filter(Boolean),
                    clinicIds: Array.from(new Set((list || []).map((p) => String(p?.clinicId || '').trim()).filter(Boolean))),
                }));
            } catch (_) {}
            const hoje = normalizeDateLocal(new Date());
            let atestadosHoje = 0;
            let canMeasureAtestadosHoje = false;
            let ultimoAtendimento = (Array.isArray(services) ? services : [])
                .map(extractServiceDate)
                .filter(Boolean)
                .sort((a, b) => b - a)[0] || null;
            (list || []).forEach((p) => {
                if (!Array.isArray(p.atestados)) return;
                canMeasureAtestadosHoje = true;
                p.atestados.forEach((a) => {
                    const data = normalizeDateLocal(a.data || a.createdAt);
                    if (data && data === hoje) atestadosHoje += 1;
                });
            });

            setMetricValue(homeProntuarioPacientes, String(total), total === 0);
            setMetricValue(homeProntuarioUltimo, formatDateShort(ultimoAtendimento), !ultimoAtendimento);
            setMetricValue(homeProntuarioAtestados, canMeasureAtestadosHoje ? String(atestadosHoje) : '--', !canMeasureAtestadosHoje || atestadosHoje === 0);
            if (homeProntuarioAtestados) {
                if (canMeasureAtestadosHoje) {
                    homeProntuarioAtestados.removeAttribute('title');
                    homeProntuarioAtestados.removeAttribute('aria-label');
                } else {
                    homeProntuarioAtestados.setAttribute('title', 'Resumo global de atestados ainda esta em consolidacao central.');
                    homeProntuarioAtestados.setAttribute('aria-label', 'Resumo global de atestados ainda esta em consolidacao central.');
                }
            }
            if (homeProntuarioUpdated) {
                homeProntuarioUpdated.textContent = canMeasureAtestadosHoje
                    ? formatUpdated()
                    : `${formatUpdated()} • docs em consolidacao`;
            }
            try {
                console.info('[HOME] management_widget_loaded', JSON.stringify({
                    widget: 'home-prontuario',
                    management_widget_source: canMeasureAtestadosHoje ? 'patients-list|services-list-all' : 'patients-list|services-list-all(partial)',
                    management_widget_metric: 'pacientes_ativos|ultimo_atendimento|atestados_hoje',
                    management_widget_zero_reason: (total || ultimoAtendimento || atestadosHoje) ? '' : (canMeasureAtestadosHoje ? 'no_data' : 'unsupported_global_aggregate'),
                }));
            } catch (_) {}
        } catch (err) {
            console.warn('[HOME] nao foi possivel carregar prontuario', err);
            setMetricValue(homeProntuarioPacientes, '0', true);
            setMetricValue(homeProntuarioUltimo, '--', true);
            setMetricValue(homeProntuarioAtestados, '--', true);
            if (homeProntuarioUpdated) homeProntuarioUpdated.textContent = 'Sem acesso';
        }
    };

    const updateHomePlansPanel = async () => {
        if (!plansApi.dashboard) {
            setMetricValue(homePlanosAtivos, '0', true);
            setMetricValue(homePlanosVencendo, '0', true);
            setMetricValue(homePlanosLiberados, '0', true);
            if (homePlanosRecebidoMes) homePlanosRecebidoMes.textContent = formatCurrency(0);
            setMetricValue(homePlanosInadimplencia, '0', true);
            return;
        }
        try {
            const dash = await plansApi.dashboard();
            const ativos = Number(dash?.ativos) || 0;
            const pendenteTotal = Number(dash?.pendenteTotal ?? dash?.pendingInstallments ?? 0) || 0;
            const liberados = Number(dash?.liberados) || 0;
            const recebidoMes = Number(dash?.recebidoMes) || 0;
            const inadimplencia = Number(dash?.inadimplencia) || 0;
            setMetricValue(homePlanosAtivos, String(ativos), ativos === 0);
            if (homePlanosVencendo) homePlanosVencendo.textContent = formatCurrency(pendenteTotal);
            setMetricValue(homePlanosLiberados, String(liberados), liberados === 0);
            if (homePlanosRecebidoMes) homePlanosRecebidoMes.textContent = formatCurrency(recebidoMes);
            setMetricValue(homePlanosInadimplencia, String(inadimplencia), inadimplencia === 0);
            if (homePlanosNote) homePlanosNote.textContent = `Recebido vs pendente: ${formatCurrency(recebidoMes)} / ${formatCurrency(pendenteTotal)}`;
            try {
                console.info('[HOME] management_widget_loaded', JSON.stringify({
                    widget: 'home-planos',
                    management_widget_source: 'plans-dashboard',
                    management_widget_metric: 'ativos|pendente_total|liberados|recebido_mes|inadimplencia',
                    management_widget_zero_reason: (ativos || pendenteTotal || liberados || recebidoMes || inadimplencia) ? '' : 'no_data',
                }));
            } catch (_) {}
        } catch (err) {
            console.warn('[HOME] nao foi possivel carregar planos', err);
            setMetricValue(homePlanosAtivos, '0', true);
            setMetricValue(homePlanosVencendo, '0', true);
            setMetricValue(homePlanosLiberados, '0', true);
            if (homePlanosRecebidoMes) homePlanosRecebidoMes.textContent = formatCurrency(0);
            setMetricValue(homePlanosInadimplencia, '0', true);
        }
    };

    const updateHomeCampaignsPanel = async () => {
        if (!campanhasApi.dashboard) {
            setMetricValue(homeCampanhasHoje, '0', true);
            setMetricValue(homeCampanhasResposta, '--', true);
            setMetricValue(homeCampanhasProximo, '--', true);
            return;
        }
        try {
            const dash = await campanhasApi.dashboard();
            const sentToday = Number(dash?.sentToday) || 0;
            const failedToday = Number(dash?.failedToday) || 0;
            const responseRate = dash?.responseRate;
            const deliveryRateToday = dash?.deliveryRateToday;
            const nextEligible = dash?.nextEligibleSend || null;
            const nextDate = normalizeDateLocal(nextEligible?.inicio || '');
            const nextDateObj = nextDate ? new Date(`${nextDate}T00:00:00`) : null;

            setMetricValue(homeCampanhasHoje, String(sentToday), sentToday === 0);
            if (homeCampanhasHoje) {
                const deliveryPct = deliveryRateToday === null || deliveryRateToday === undefined
                    ? '--'
                    : `${Math.max(0, Math.min(100, Math.round(Number(deliveryRateToday) * 100)))}%`;
                homeCampanhasHoje.setAttribute('title', `Falhas hoje: ${failedToday} | Taxa de entrega: ${deliveryPct}`);
            }
            if (responseRate === null || responseRate === undefined || Number.isNaN(Number(responseRate))) {
                setMetricValue(homeCampanhasResposta, '--', true);
                if (homeCampanhasResposta) {
                    homeCampanhasResposta.setAttribute('title', 'Disponivel quando WhatsApp estiver integrado com respostas');
                    homeCampanhasResposta.setAttribute('aria-label', 'Disponivel quando WhatsApp estiver integrado com respostas');
                }
            } else {
                const pct = Math.max(0, Math.min(100, Math.round(Number(responseRate) * 100)));
                setMetricValue(homeCampanhasResposta, `${pct}%`, false);
                homeCampanhasResposta?.removeAttribute('title');
                homeCampanhasResposta?.removeAttribute('aria-label');
            }
            const nextLabel = nextDateObj ? formatDateShort(nextDateObj) : 'Sem campanhas agendadas';
            setMetricValue(homeCampanhasProximo, nextLabel, !nextDateObj);
            if (homeCampanhasProximo) {
                const deliveryPct = deliveryRateToday === null || deliveryRateToday === undefined
                    ? '--'
                    : `${Math.max(0, Math.min(100, Math.round(Number(deliveryRateToday) * 100)))}%`;
                homeCampanhasProximo.setAttribute('title', `Taxa de entrega hoje: ${deliveryPct}`);
            }
            try {
                console.info('[HOME] management_widget_loaded', JSON.stringify({
                    widget: 'home-campanhas',
                    management_widget_source: 'campaigns-dashboard',
                    management_widget_metric: 'enviadas_hoje|taxa_resposta|proximo_envio',
                    management_widget_zero_reason: (sentToday || nextDateObj || (responseRate !== null && responseRate !== undefined)) ? '' : 'no_data',
                }));
            } catch (_) {}
        } catch (err) {
            console.warn('[HOME] nao foi possivel carregar campanhas', err);
            setMetricValue(homeCampanhasHoje, '0', true);
            setMetricValue(homeCampanhasResposta, '--', true);
            setMetricValue(homeCampanhasProximo, '--', true);
        }
    };

    const setupUserMenu = async () => {
        try {
            const user = await authApi.currentUser?.();
            const authContext = authApi.currentContext ? await authApi.currentContext().catch(() => null) : null;
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
            if (user.tipo === 'super_admin') {
                window.location.href = 'super-admin.html';
                return;
            }
            if (user.mustChangePassword && !user.isImpersonatedSession) {
                window.location.href = 'change-password.html';
                return;
            }

            currentUser = user;
            if (userNameEl) userNameEl.textContent = getDisplayName(user);
            if (userRoleEl) {
                const roleLabel = formatRole(user.tipo || '');
                const supportSuffix = authContext?.isImpersonatedSession ? ' • suporte' : '';
                userRoleEl.textContent = `${roleLabel}${supportSuffix}`;
            }

            if (userMenuDropdown && !clinicItem) {
                clinicItem = document.createElement('button');
                clinicItem.className = 'user-menu-item';
                clinicItem.type = 'button';
                clinicItem.dataset.action = 'clinic';
                clinicItem.textContent = 'Minha clinica';
                if (manageItem) {
                    userMenuDropdown.insertBefore(clinicItem, manageItem);
                } else {
                    userMenuDropdown.prepend(clinicItem);
                }
            }

            if (manageItem) {
                manageItem.remove();
            }

            if (clinicItem) {
                clinicItem.style.display = canManageClinic(user) ? 'block' : 'none';
                clinicItem.addEventListener('click', () => {
                    closeDropdown();
                    window.location.href = 'clinica.html';
                });
            }

            if (gestaoToggle) {
                const allowed = canManageClinic(user);
                gestaoToggle.disabled = !allowed;
                gestaoToggle.setAttribute('aria-disabled', allowed ? 'false' : 'true');
                gestaoToggle.title = allowed ? '' : 'Acesso restrito';
            }

            if (changePassItem) {
                changePassItem.remove();
            }

            if (logoutItem) {
                logoutItem.addEventListener('click', async () => {
                    closeDropdown();
                    try {
                        await authApi.logout?.();
                    } finally {
                        window.location.href = 'login.html';
                    }
                });
            }

            if (userMenuToggle) {
                userMenuToggle.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    toggleDropdown();
                });
            }

            if (attnToggle) {
                attnToggle.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    toggleExclusive(attnDropdown, attnToggle);
                });
            }

    if (gestaoToggle) {
        gestaoToggle.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!canManageClinic(user)) return;
            toggleExclusive(gestaoDropdown, gestaoToggle);
        });
    }

    if (actionsToggle) {
        actionsToggle.addEventListener('click', (ev) => {
            ev.stopPropagation();
            toggleExclusive(actionsMenu, actionsToggle);
        });
    }
            document.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape') closeDropdown();
            });

            if (!canManageClinic(user) && user.tipo === 'dentista') {
                ['#card-gestao-controle'].forEach((sel) => {
                    const el = document.querySelector(sel);
                    if (el) el.style.display = 'none';
                });
            }
        } catch (err) {
            console.error('Erro ao carregar usuario logado', err);
            window.location.href = 'login.html';
        }
    };

    setupUserMenu();
    loadAgendaMini();
    loadCentralNotificationEvents();
    updateHomeAgendaPanel(agendaCache);
    updateHomeServicesPanel();
    updateHomeProntuarioPanel();
    updateHomePlansPanel();
    updateHomeCampaignsPanel();
    agendaRefresh?.addEventListener('click', loadAgendaMini);
    agendaFilters.forEach((btn) => {
        btn.addEventListener('click', () => {
            applyAgendaFilter(btn.dataset.agendaFilter || 'todos');
        });
    });
    agendaMiniList?.addEventListener('click', (ev) => {
        const target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.dataset.action === 'retry-agenda') {
            loadAgendaMini();
        }
    });
    applyAgendaFilter(agendaFilter);
    setFinanceHidden(loadFinanceHidden());
    homeGestaoTabs.forEach((btn) => {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const view = btn.dataset.gestaoView || 'financeiro';
            homeGestaoView = view;
            homeGestaoTabs.forEach((item) => {
                const active = item === btn;
                item.classList.toggle('active', active);
                item.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            renderHomeGestaoCard();
            if (view === 'operacional') {
                loadHomeOperationalPanel();
            }
        });
    });
    renderHomeGestaoCard();
    loadHomeOperationalPanel();
    startHomeAutoRefresh();
    financeToggle?.addEventListener('click', () => {
        setFinanceHidden(!(financeMini && financeMini.classList.contains('is-hidden')));
    });
    updateFinanceFilterButtons(financePeriod);
    loadFinanceMini();
    financeRefresh?.addEventListener('click', loadFinanceMini);
    financeFilters.forEach((btn) => {
        btn.addEventListener('click', () => {
            const period = btn.dataset.financePeriod || 'dia';
            financePeriod = period;
            updateFinanceFilterButtons(period);
            renderFinanceMini();
            refreshNotifications();
        });
    });
    window.addEventListener('finance-updated', scheduleHomeFinanceSync);
    window.addEventListener('storage', (event) => {
        if (event.key !== 'voithos-finance-updated') return;
        scheduleHomeFinanceSync();
    });
    window.addEventListener('campaigns-updated', () => {
        updateHomeCampaignsPanel();
    });
    window.addEventListener('storage', (event) => {
        if (event.key !== 'voithos-campaigns-updated') return;
        updateHomeCampaignsPanel();
    });
    updateFinanceFilterButtons(financePeriod);
    window.addEventListener('beforeunload', () => {
        if (homeAutoRefreshTimer) clearInterval(homeAutoRefreshTimer);
    });
});













