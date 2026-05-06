document.addEventListener('DOMContentLoaded', () => {
  const PAYMENT_RETURN_STORAGE_KEY = 'voithos.checkout.return';
  const authApi = window.appApi?.auth || {};
  const subscriptionApi = window.appApi?.subscription || {};
  const primaryButton = document.getElementById('return-primary-button');
  const secondaryButton = document.getElementById('return-secondary-button');
  const badge = document.getElementById('return-badge');
  const title = document.getElementById('return-title');
  const copy = document.getElementById('return-copy');
  const card = document.getElementById('return-card');
  const statusTitle = document.getElementById('return-status-title');
  const statusCopy = document.getElementById('return-status-copy');
  const statusDetail = document.getElementById('return-status-detail');
  const message = document.getElementById('return-message');

  const params = new URLSearchParams(window.location.search || '');
  const paymentStatus = String(params.get('payment') || '').trim().toLowerCase();
  let isBusy = false;

  const readContext = () => {
    try {
      const raw = localStorage.getItem(PAYMENT_RETURN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  };

  const clearContext = () => {
    try {
      localStorage.removeItem(PAYMENT_RETURN_STORAGE_KEY);
    } catch (_error) {
      // best-effort only
    }
  };

  const getContext = () => readContext() || {};

  const setMessage = (value) => {
    if (message) message.textContent = String(value || '').trim();
  };

  const setLoading = (value) => {
    isBusy = value === true;
    if (primaryButton) primaryButton.disabled = isBusy;
    if (secondaryButton) secondaryButton.disabled = isBusy;
  };

  const openPaymentLink = async () => {
    const paymentLink = String(getContext()?.paymentLink || '').trim();
    if (!paymentLink) {
      setMessage('Nenhum checkout valido foi encontrado para reabrir.');
      return;
    }

    const isDesktopMode = String(window.appApi?.mode || '').trim().toLowerCase() === 'desktop';
    if (isDesktopMode && typeof window.appApi?.openExternalUrl === 'function') {
      await window.appApi.openExternalUrl(paymentLink);
      return;
    }

    window.location.assign(paymentLink);
  };

  const goToLogin = () => {
    window.location.href = 'login.html';
  };

  const goToApp = () => {
    clearContext();
    window.location.href = 'index.html';
  };

  const isSubscriptionActive = (result = {}) => {
    const effectiveStatus = String(result?.effectiveStatus || result?.subscription?.status || '').trim().toUpperCase();
    return ['ACTIVE', 'GRACE_PERIOD'].includes(effectiveStatus) || Boolean(result?.token && result?.user);
  };

  const updateView = ({
    tone = 'info',
    badgeText = 'Retorno seguro',
    pageTitle = 'Estamos validando seu pagamento',
    pageCopy = 'A Voithos recebeu seu retorno do checkout. Vamos confirmar a ativacao desta conta antes de liberar o acesso.',
    cardTitleText = 'Confirmando pagamento',
    cardCopyText = 'Isso normalmente leva apenas alguns instantes.',
    cardDetailText = '',
    primaryLabel = 'Verificar novamente',
    primaryAction = null,
    secondaryLabel = '',
    secondaryAction = null,
    statusMessage = '',
  } = {}) => {
    if (badge) badge.textContent = badgeText;
    if (title) title.textContent = pageTitle;
    if (copy) copy.textContent = pageCopy;
    if (statusTitle) statusTitle.textContent = cardTitleText;
    if (statusCopy) statusCopy.textContent = cardCopyText;
    if (statusDetail) statusDetail.textContent = cardDetailText;
    setMessage(statusMessage);

    if (card) {
      card.classList.remove('is-success', 'is-warn', 'is-danger');
      if (tone === 'success') card.classList.add('is-success');
      if (tone === 'warn') card.classList.add('is-warn');
      if (tone === 'danger') card.classList.add('is-danger');
    }

    if (primaryButton) {
      primaryButton.textContent = primaryLabel;
      primaryButton.onclick = primaryAction;
    }

    if (secondaryButton) {
      const visible = Boolean(secondaryLabel && secondaryAction);
      secondaryButton.classList.toggle('hidden', !visible);
      secondaryButton.textContent = secondaryLabel || '';
      secondaryButton.onclick = secondaryAction;
    }
  };

  const confirmPaymentReturn = async () => {
    if (isBusy) return;
    setLoading(true);
    setMessage('');
    updateView({
      tone: 'info',
      badgeText: 'Validando retorno',
      pageTitle: 'Quase la',
      pageCopy: 'Estamos confirmando a assinatura para liberar sua entrada na Voithos.',
      cardTitleText: 'Conferencia em andamento',
      cardCopyText: 'Se o banco ja respondeu ao Asaas, a liberacao deve acontecer em seguida.',
      cardDetailText: 'Voce pode aguardar nesta tela ou solicitar uma nova verificacao manual.',
      primaryLabel: 'Verificando...',
      primaryAction: null,
      secondaryLabel: String(getContext()?.paymentLink || '').trim() ? 'Abrir checkout novamente' : '',
      secondaryAction: String(getContext()?.paymentLink || '').trim() ? (() => openPaymentLink().catch((error) => {
        console.error('Falha ao reabrir checkout', error);
        setMessage('Nao foi possivel reabrir o checkout agora.');
      })) : null,
    });

    try {
      const currentUser = typeof authApi.currentUser === 'function'
        ? await authApi.currentUser().catch(() => null)
        : null;

      let result = null;
      if (currentUser && typeof subscriptionApi.refreshPaymentStatus === 'function') {
        result = await subscriptionApi.refreshPaymentStatus();
      } else {
        const context = getContext();
        if (
          context.mode === 'pending_signup'
          && context.pendingSignupEmail
          && context.pendingSignupToken
          && typeof authApi.refreshPendingSignupPaymentStatus === 'function'
        ) {
          result = await authApi.refreshPendingSignupPaymentStatus({
            email: context.pendingSignupEmail,
            pendingSignupToken: context.pendingSignupToken,
          });
        }
      }

      if (isSubscriptionActive(result)) {
        clearContext();
        updateView({
          tone: 'success',
          badgeText: 'Bem-vindo a Voithos',
          pageTitle: 'Sua assinatura foi confirmada',
          pageCopy: 'Pagamento aprovado. A conta ja pode seguir para o ambiente principal da Voithos.',
          cardTitleText: 'Acesso liberado',
          cardCopyText: 'A ativacao foi concluida com sucesso.',
          cardDetailText: 'Voce sera direcionado automaticamente em instantes. Se preferir, entre agora.',
          primaryLabel: 'Entrar na Voithos',
          primaryAction: goToApp,
          secondaryLabel: 'Voltar ao login',
          secondaryAction: goToLogin,
        });
        window.setTimeout(goToApp, 1800);
        return;
      }

      updateView({
        tone: 'warn',
        badgeText: 'Pagamento em analise',
        pageTitle: 'Recebemos seu retorno',
        pageCopy: 'O checkout foi concluido, mas a confirmacao final ainda nao chegou ao sistema.',
        cardTitleText: 'Aguardando confirmacao',
        cardCopyText: 'Isso pode acontecer quando o banco ou o Asaas ainda estao finalizando a conciliacao.',
        cardDetailText: 'Espere alguns segundos e solicite uma nova verificacao.',
        primaryLabel: 'Verificar novamente',
        primaryAction: () => {
          confirmPaymentReturn().catch((error) => {
            console.error('Falha ao confirmar retorno de pagamento', error);
          });
        },
        secondaryLabel: String(getContext()?.paymentLink || '').trim() ? 'Abrir checkout novamente' : 'Voltar ao login',
        secondaryAction: String(getContext()?.paymentLink || '').trim()
          ? (() => openPaymentLink().catch((error) => {
              console.error('Falha ao reabrir checkout', error);
              setMessage('Nao foi possivel reabrir o checkout agora.');
            }))
          : goToLogin,
        statusMessage: 'Se voce acabou de pagar, aguarde alguns instantes antes de tentar novamente.',
      });
    } catch (error) {
      console.error('Falha ao confirmar retorno de pagamento', error);
      updateView({
        tone: 'danger',
        badgeText: 'Falha na confirmacao',
        pageTitle: 'Nao foi possivel validar o pagamento agora',
        pageCopy: 'O retorno do checkout chegou, mas a confirmacao automatica falhou nesta tentativa.',
        cardTitleText: 'Verificacao interrompida',
        cardCopyText: 'O problema pode ser temporario. A melhor acao agora e tentar a verificacao novamente.',
        cardDetailText: error?.message || 'Erro desconhecido ao validar o pagamento.',
        primaryLabel: 'Tentar novamente',
        primaryAction: () => {
          confirmPaymentReturn().catch((innerError) => {
            console.error('Falha ao repetir confirmacao de pagamento', innerError);
          });
        },
        secondaryLabel: 'Voltar ao login',
        secondaryAction: goToLogin,
      });
    } finally {
      setLoading(false);
    }
  };

  const renderCancelled = () => {
    updateView({
      tone: 'warn',
      badgeText: 'Pagamento interrompido',
      pageTitle: 'Checkout cancelado',
      pageCopy: 'O pagamento nao foi concluido desta vez. Voce pode voltar para a Voithos, revisar a cobranca e tentar novamente.',
      cardTitleText: 'Nenhuma assinatura foi ativada',
      cardCopyText: 'Se quiser continuar, gere um novo checkout ou reabra o checkout atual.',
      cardDetailText: 'A conta segue protegida: sem confirmacao de pagamento, nao ha liberacao definitiva de acesso.',
      primaryLabel: 'Voltar ao login',
      primaryAction: goToLogin,
      secondaryLabel: String(getContext()?.paymentLink || '').trim() ? 'Abrir checkout novamente' : '',
      secondaryAction: String(getContext()?.paymentLink || '').trim()
        ? (() => openPaymentLink().catch((error) => {
            console.error('Falha ao reabrir checkout', error);
            setMessage('Nao foi possivel reabrir o checkout agora.');
          }))
        : null,
    });
  };

  const renderExpired = () => {
    updateView({
      tone: 'danger',
      badgeText: 'Checkout expirado',
      pageTitle: 'O checkout expirou',
      pageCopy: 'O link de pagamento perdeu a validade. Gere um novo checkout na Voithos para seguir com a ativacao.',
      cardTitleText: 'Nova geracao necessaria',
      cardCopyText: 'Por seguranca, o checkout nao pode ser reaproveitado depois do vencimento.',
      cardDetailText: 'Volte para a plataforma e crie um novo checkout antes de tentar pagar novamente.',
      primaryLabel: 'Voltar ao login',
      primaryAction: goToLogin,
      secondaryLabel: '',
      secondaryAction: null,
    });
  };

  const renderFallback = () => {
    updateView({
      tone: 'warn',
      badgeText: 'Retorno do pagamento',
      pageTitle: 'Volte para a Voithos',
      pageCopy: 'Nao recebemos um status conclusivo deste retorno. Entre novamente para continuar a validacao do pagamento.',
      cardTitleText: 'Status indefinido',
      cardCopyText: 'Se o pagamento foi concluido, a verificacao podera ser refeita dentro da plataforma.',
      cardDetailText: '',
      primaryLabel: 'Voltar ao login',
      primaryAction: goToLogin,
      secondaryLabel: String(getContext()?.paymentLink || '').trim() ? 'Abrir checkout' : '',
      secondaryAction: String(getContext()?.paymentLink || '').trim()
        ? (() => openPaymentLink().catch((error) => {
            console.error('Falha ao abrir checkout', error);
            setMessage('Nao foi possivel abrir o checkout agora.');
          }))
        : null,
    });
  };

  if (paymentStatus === 'success') {
    confirmPaymentReturn().catch((error) => {
      console.error('Falha ao iniciar confirmacao do retorno', error);
    });
    return;
  }

  if (paymentStatus === 'cancelled') {
    renderCancelled();
    return;
  }

  if (paymentStatus === 'expired') {
    renderExpired();
    return;
  }

  renderFallback();
});
