const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

const formatDateBr = (dateValue) => {
  const raw = String(dateValue || '').trim();
  if (!raw) return '-';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}/${m}/${y}`;
};

const resolvePatientName = (patient = {}, appointment = {}) =>
  String(patient?.nome || patient?.fullName || appointment?.pacienteNome || appointment?.paciente || 'Paciente').trim();

const resolveClinicName = (appointment = {}, clinicSettings = {}) =>
  String(
    appointment?.clinicName
    || clinicSettings?.clinicProfile?.nomeFantasia
    || clinicSettings?.nomeClinica
    || clinicSettings?.clinicProfile?.razaoSocial
    || clinicSettings?.razaoSocial
    || 'Voithos',
  ).trim();

const resolveAppointmentHour = (appointment = {}) =>
  String(appointment?.horaInicio || appointment?.time || '').trim() || '--:--';

const resolveAppointmentId = (appointment = {}) =>
  String(appointment?.id || appointment?.appointmentId || '').trim();

const summarizeAppointmentForLog = (appointment = {}) => ({
  id: String(appointment?.id || '').trim(),
  appointmentId: String(appointment?.appointmentId || '').trim(),
  remoteId: String(appointment?.remoteId || '').trim(),
  centralAppointmentId: String(appointment?.centralAppointmentId || '').trim(),
  clinicId: String(appointment?.clinicId || '').trim(),
  patientId: String(appointment?.patientId || appointment?.pacienteId || appointment?.prontuario || '').trim(),
  data: String(appointment?.data || '').trim(),
  horaInicio: String(appointment?.horaInicio || '').trim(),
  dentistaId: String(appointment?.dentistaId || appointment?.profissionalId || '').trim(),
  source: String(appointment?.source || appointment?.__source || '').trim(),
});

const getAppointmentWorkflowState = (appointment = {}) => {
  const status = String(appointment?.status || '').trim().toLowerCase();
  return {
    status,
    confirmationPending: appointment?.confirmationPending === true,
    resolved: appointment?.confirmado === true || ['confirmado', 'remarcar', 'cancelado'].includes(status),
  };
};

const resolveCampaignId = (campaign = {}) =>
  String(campaign?.id || campaign?.campaignId || '').trim();

const createWhatsAppService = ({
  getClinicSettings,
  logWhatsappSent,
  logWhatsappFailed,
  whatsappEngineService,
  whatsappPendingQueueService,
  centralBackendAdapter,
}) => {
  const providerName = 'whatsapp_engine';
  const isQueueableWhatsAppError = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    return [
      'ENGINE_UNAVAILABLE',
      'ENGINE_TIMEOUT',
      'ENGINE_RECONNECTING',
      'ENGINE_STARTING',
    ].includes(code);
  };

  const sendText = async ({ clinicId, phone, message, type = 'MANUAL', patientId = '', appointmentId = '', campaignId = '' }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPhone = normalizePhone(phone);
    const normalizedMessage = String(message || '').trim();
    if (!normalizedClinicId) throw new Error('clinicId obrigatorio.');
    if (!normalizedPhone) throw new Error('Telefone invalido para envio.');
    if (!normalizedMessage) throw new Error('Mensagem vazia.');
    if (!whatsappEngineService?.sendClinicText) throw new Error('WhatsApp Engine indisponivel para envio.');

    try {
      const response = await whatsappEngineService.sendClinicText({
        clinicId: normalizedClinicId,
        phone: normalizedPhone,
        message: normalizedMessage,
        appointmentId: String(appointmentId || '').trim() || undefined,
      });

      const connection = await whatsappEngineService.getClinicConnection({
        clinicId: normalizedClinicId,
        createIfMissing: false,
      }).catch(() => null);

      return {
        success: true,
        phone: normalizedPhone,
        status: 202,
        body: JSON.stringify(response || {}),
        provider: providerName,
        clinicId: normalizedClinicId,
        instanceId: connection?.instanceId || response?.instanceId || '',
        clinicSenderPhone: normalizePhone(connection?.phoneNumber || ''),
        jobId: response?.jobId || '',
      };
    } catch (error) {
      if (!isQueueableWhatsAppError(error) || !whatsappPendingQueueService?.enqueuePending) {
        throw error;
      }
      const queued = await whatsappPendingQueueService.enqueuePending({
        clinicId: normalizedClinicId,
        phone: normalizedPhone,
        message: normalizedMessage,
        type,
        patientId,
        appointmentId,
        campaignId,
      });
      return {
        success: true,
        queued: true,
        pending: true,
        phone: normalizedPhone,
        status: 202,
        provider: 'desktop_fallback_queue',
        clinicId: normalizedClinicId,
        pendingId: queued?.jobId || '',
        instanceId: '',
        clinicSenderPhone: '',
        body: JSON.stringify({
          queued: true,
          pendingId: queued?.jobId || '',
        }),
      };
    }
  };

  const logSent = async (entry) => {
    if (typeof logWhatsappSent === 'function') {
      await logWhatsappSent(entry);
    }
  };

  const logFailed = async (entry) => {
    if (typeof logWhatsappFailed === 'function') {
      await logWhatsappFailed(entry);
    }
  };

  const observeCentralAppointmentState = async ({ clinicId, appointment = {}, patient = {} }) => {
    if (!centralBackendAdapter?.isEnabled?.()) return null;
    if (typeof centralBackendAdapter?.resolveAppointmentTransportId !== 'function') return null;
    if (typeof centralBackendAdapter?.getAppointmentById !== 'function') return null;
    try {
      const resolvedId = await centralBackendAdapter.resolveAppointmentTransportId({
        clinicId: String(clinicId || '').trim(),
        appointment,
        patient,
      });
      if (!resolvedId) return null;
      return await centralBackendAdapter.getAppointmentById(resolvedId, { clinicId: String(clinicId || '').trim() });
    } catch (_) {
      return null;
    }
  };

  const sendAppointmentConfirmation = async ({ clinicId, patient = {}, appointment = {} }) => {
    const appointmentId = resolveAppointmentId(appointment);
    const canUseCentralConfirmation =
      centralBackendAdapter?.isEnabled?.() === true
      && typeof centralBackendAdapter?.sendAppointmentConfirmation === 'function';
    const clinic = typeof getClinicSettings === 'function' ? await getClinicSettings(clinicId) : {};
    const patientName = resolvePatientName(patient, appointment);
    const clinicName = resolveClinicName(appointment, clinic);
    const message = `Olá, ${patientName}! 👋\n\nSua consulta na clínica ${clinicName} foi agendada com sucesso.\n\n📅 Data: ${formatDateBr(appointment?.data)}\n⏰ Horário: ${resolveAppointmentHour(appointment)}\n\nResponda:\n1 para CONFIRMAR\n2 para REMARCAR`;
    const phone = patient?.telefone || patient?.phone || patient?.celular || patient?.whatsapp || appointment?.telefone || '';
    const entry = {
      clinicId: String(clinicId || '').trim(),
      provider: providerName,
      patientId: String(patient?.prontuario || patient?.id || patient?._id || appointment?.pacienteId || '').trim(),
      appointmentId: resolveAppointmentId(appointment),
      campaignId: '',
      phone: normalizePhone(phone),
      message,
      type: 'APPOINTMENT_CONFIRMATION',
    };
    try {
      console.info('[whatsapp][appointment-confirmation] dispatch requested', {
        clinicId: String(clinicId || '').trim(),
        appointment: summarizeAppointmentForLog(appointment),
      });
      let result;
      if (canUseCentralConfirmation) {
        try {
          result = await centralBackendAdapter.sendAppointmentConfirmation({
            clinicId: String(clinicId || '').trim(),
            appointment,
            patient,
          });
        } catch (error) {
          const observedAppointment = await observeCentralAppointmentState({
            clinicId,
            appointment,
            patient,
          });
          const observedState = getAppointmentWorkflowState(observedAppointment || {});
          if (observedState.confirmationPending || observedState.resolved) {
            result = {
              deduped: true,
              alreadyPending: observedState.confirmationPending,
              alreadyResolved: observedState.resolved,
              confirmationPending: observedState.confirmationPending,
              lastConfirmationSentAt: observedAppointment?.lastConfirmationSentAt || '',
            };
          } else {
            throw error;
          }
        }
      } else {
        result = await sendText({
          clinicId,
          phone,
          message,
          type: 'APPOINTMENT_CONFIRMATION',
          patientId: entry.patientId,
          appointmentId: entry.appointmentId,
        });
      }
      const confirmationPending = result?.confirmationPending === true;
      const deduped = result?.deduped === true || result?.alreadyPending === true;
      const alreadyResolved = result?.alreadyResolved === true;
      if (result?.queued === true || result?.pending === true) {
        return { success: true, queued: true, result };
      }
      if (deduped || alreadyResolved) {
        return {
          success: true,
          deduped,
          alreadyPending: result?.alreadyPending === true,
          alreadyResolved,
          confirmationPending,
          lastConfirmationSentAt: result?.lastConfirmationSentAt || '',
          result,
        };
      }
      console.info('[whatsapp][appointment-confirmation] dispatch accepted', {
        clinicId: String(clinicId || '').trim(),
        appointmentId,
        transport: canUseCentralConfirmation ? 'backend_central_confirmation' : 'legacy_local_confirmation',
      });
      await logSent({
        ...entry,
        instanceId: result?.instanceId || '',
        clinicSenderPhone: result?.clinicSenderPhone || '',
        transport: canUseCentralConfirmation ? 'backend_central_confirmation' : 'legacy_local_confirmation',
      });
      return {
        success: true,
        confirmationPending,
        lastConfirmationSentAt: result?.lastConfirmationSentAt || '',
        result,
      };
    } catch (err) {
      console.error('[whatsapp][appointment-confirmation] dispatch failed', {
        clinicId: String(clinicId || '').trim(),
        appointment: summarizeAppointmentForLog(appointment),
        error: err?.message || String(err),
        code: err?.code || '',
        status: err?.status || '',
      });
      await logFailed({
        ...entry,
        instanceId: err?.audit?.instanceId || '',
        clinicSenderPhone: err?.audit?.clinicSenderPhone || '',
        errorMessage: err?.message || String(err),
        transport: canUseCentralConfirmation ? 'backend_central_confirmation' : 'legacy_local_confirmation',
      });
      return { success: false, error: err?.message || String(err) };
    }
  };

  const sendAppointmentReminder = async ({ clinicId, patient = {}, appointment = {} }) => {
    const appointmentId = resolveAppointmentId(appointment);
    const canUseCentralReminder =
      centralBackendAdapter?.isEnabled?.() === true
      && typeof centralBackendAdapter?.sendAppointmentReminder === 'function';
    const clinic = typeof getClinicSettings === 'function' ? await getClinicSettings(clinicId) : {};
    const patientName = resolvePatientName(patient, appointment);
    const clinicName = resolveClinicName(appointment, clinic);
    const message = `Olá, ${patientName}! 👋\n\nLembrando sua consulta na clínica ${clinicName}.\n\n📅 Data: ${formatDateBr(appointment?.data)}\n⏰ Horário: ${resolveAppointmentHour(appointment)}\n\nSe precisar remarcar, fale conosco.`;
    const phone = patient?.telefone || patient?.phone || patient?.celular || patient?.whatsapp || appointment?.telefone || '';
    const entry = {
      clinicId: String(clinicId || '').trim(),
      provider: providerName,
      patientId: String(patient?.prontuario || patient?.id || patient?._id || appointment?.pacienteId || '').trim(),
      appointmentId: resolveAppointmentId(appointment),
      campaignId: '',
      phone: normalizePhone(phone),
      message,
      type: 'APPOINTMENT_REMINDER',
    };
    try {
      console.info('[whatsapp][appointment-reminder] dispatch requested', {
        clinicId: String(clinicId || '').trim(),
        appointment: summarizeAppointmentForLog(appointment),
      });
      let result;
      if (canUseCentralReminder) {
        try {
          result = await centralBackendAdapter.sendAppointmentReminder({
            clinicId: String(clinicId || '').trim(),
            appointment,
            patient,
          });
        } catch (error) {
          throw error;
        }
      } else {
        result = await sendText({
          clinicId,
          phone,
          message,
          type: 'APPOINTMENT_REMINDER',
          patientId: entry.patientId,
          appointmentId: entry.appointmentId,
        });
      }
      if (result?.queued === true || result?.pending === true) {
        return { success: true, queued: true, result };
      }
      console.info('[whatsapp][appointment-reminder] dispatch accepted', {
        clinicId: String(clinicId || '').trim(),
        appointmentId,
        transport: canUseCentralReminder ? 'backend_central_reminder' : 'legacy_local_reminder',
      });
      await logSent({
        ...entry,
        instanceId: result?.instanceId || '',
        clinicSenderPhone: result?.clinicSenderPhone || '',
        transport: canUseCentralReminder ? 'backend_central_reminder' : 'legacy_local_reminder',
      });
      return { success: true, result };
    } catch (err) {
      console.error('[whatsapp][appointment-reminder] dispatch failed', {
        clinicId: String(clinicId || '').trim(),
        appointment: summarizeAppointmentForLog(appointment),
        error: err?.message || String(err),
        code: err?.code || '',
        status: err?.status || '',
      });
      await logFailed({
        ...entry,
        instanceId: err?.audit?.instanceId || '',
        clinicSenderPhone: err?.audit?.clinicSenderPhone || '',
        errorMessage: err?.message || String(err),
        transport: canUseCentralReminder ? 'backend_central_reminder' : 'legacy_local_reminder',
      });
      return { success: false, error: err?.message || String(err) };
    }
  };

  const sendWeeklyCampaignMessage = async ({ clinicId, patient = {}, campaign = {} }) => {
    const clinic = typeof getClinicSettings === 'function' ? await getClinicSettings(clinicId) : {};
    const patientName = resolvePatientName(patient, {});
    const clinicName = String(campaign?.clinicName || clinic?.nomeClinica || clinic?.razaoSocial || 'Voithos').trim();
    const rawTemplate = String(campaign?.message || campaign?.mensagem || campaign?.texto || '').trim();
    const fallback = `Olá, ${patientName}! ${String(campaign?.nome || 'Temos novidades da clínica').trim()} - ${String(campaign?.descricao || '').trim()}`.trim();
    const message = (rawTemplate || fallback)
      .replace(/\{NOME_PACIENTE\}/g, patientName)
      .replace(/\{NOME_CLINICA\}/g, clinicName);
    const phone = patient?.telefone || patient?.phone || patient?.celular || patient?.whatsapp || '';
    const entry = {
      clinicId: String(clinicId || '').trim(),
      provider: providerName,
      patientId: String(patient?.prontuario || patient?.id || patient?._id || '').trim(),
      appointmentId: '',
      campaignId: resolveCampaignId(campaign),
      phone: normalizePhone(phone),
      message,
      type: 'CAMPAIGN',
    };
    try {
      const result = await sendText({
        clinicId,
        phone,
        message,
        type: 'CAMPAIGN',
        patientId: entry.patientId,
        campaignId: entry.campaignId,
      });
      if (result?.queued === true || result?.pending === true) {
        return { success: true, queued: true, result };
      }
      await logSent({
        ...entry,
        instanceId: result?.instanceId || '',
        clinicSenderPhone: result?.clinicSenderPhone || '',
      });
      return { success: true, result };
    } catch (err) {
      await logFailed({
        ...entry,
        instanceId: err?.audit?.instanceId || '',
        clinicSenderPhone: err?.audit?.clinicSenderPhone || '',
        errorMessage: err?.message || String(err),
      });
      return { success: false, error: err?.message || String(err) };
    }
  };

  const sendMessage = async ({ clinicConfig = {}, to, text }) => {
    // Compatibilidade com fluxos legados: usa clinicId da configuracao para despachar pelo engine.
    const message = String(text || '').trim();
    const phone = normalizePhone(to);
    if (!message) throw new Error('Mensagem vazia.');
    if (!phone) throw new Error('Telefone invalido.');
    const clinicId = String(clinicConfig?.clinicId || clinicConfig?.id || '').trim();
    if (!clinicId) throw new Error('clinicId ausente na configuracao da clinica.');
    return sendText({
      clinicId,
      phone,
      message,
      type: 'MANUAL',
    });
  };

  return {
    normalizePhone,
    sendText,
    sendAppointmentConfirmation,
    sendAppointmentReminder,
    sendWeeklyCampaignMessage,
    sendMessage,
  };
};

module.exports = { createWhatsAppService, normalizePhone };
