const path = require('path');
const {
  SOURCE,
  withSource,
} = require('../shared/utils/hybrid-source-utils');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const registerAgendaHandlers = ({
  ipcMain,
  BrowserWindow,
  requireRole,
  requireAccess,
  agendaGetRange,
  agendaGetDay,
  agendaAdd,
  agendaUpdate,
  agendaDelete,
  agendaSyncConsultas,
  sendAppointmentConfirmation,
  centralBackendAdapter,
  readPatient,
  savePatient,
  currentUserRef,
}) => {
  let centralLogged = false;
  const getCurrentClinicId = () => String(
    (typeof currentUserRef === 'function' ? currentUserRef()?.clinicId : '')
    || DEFAULT_CLINIC_ID
  ).trim() || DEFAULT_CLINIC_ID;

  const isCentralEnabled = () => centralBackendAdapter?.isEnabled?.() === true;
  const shouldFallbackToLocal = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    const status = Number(error?.status || 0);
    return code === 'CENTRAL_BACKEND_UNAVAILABLE'
      || code === 'CENTRAL_BACKEND_TIMEOUT'
      || error?.name === 'AbortError'
      || status >= 500;
  };

  const logCentralActive = () => {
    if (centralLogged) return;
    centralLogged = true;
    console.info('[AGENDA] central backend active');
  };

  const logLoadedFromCentral = (mode, extra = {}) => {
    console.info('[AGENDA] appointments_loaded_from=central', JSON.stringify({
      mode,
      clinicId: getCurrentClinicId(),
      source: SOURCE.CENTRAL,
      ...extra,
    }));
  };

  const logFallback = (mode, reason) => {
    console.warn('[AGENDA] appointments_fallback_to_local=true', JSON.stringify({
      mode,
      module: 'agenda',
      operation: mode,
      clinicId: getCurrentClinicId(),
      source: SOURCE.LEGACY,
      fallback_triggered: true,
      fallback_reason: reason || '',
      reason: reason || '',
    }));
  };

  const logCentralUnavailable = (error) => {
    console.warn('[AGENDA] central backend unavailable', error?.message || error);
  };

  const sortAppointments = (items = []) => [...(items || [])].sort((left, right) => {
    const leftKey = `${String(left?.data || '')} ${String(left?.horaInicio || '')}`;
    const rightKey = `${String(right?.data || '')} ${String(right?.horaInicio || '')}`;
    return leftKey.localeCompare(rightKey);
  });

  const markLegacyAppointments = (items = []) => items.map((appointment) => withSource(appointment, SOURCE.LEGACY));
  const markCentralAppointments = (items = []) => sortAppointments(items.map((appointment) => withSource(appointment, SOURCE.CENTRAL)));

  const hasPatientContactDiff = (centralPatient = {}, localPatient = {}) => {
    const centralPhone = String(
      centralPatient?.telefone || centralPatient?.phone || centralPatient?.celular || ''
    ).replace(/\D/g, '');
    const localPhone = String(
      localPatient?.telefone || localPatient?.phone || localPatient?.celular || localPatient?.whatsapp || ''
    ).replace(/\D/g, '');
    const centralEmail = String(centralPatient?.email || '').trim().toLowerCase();
    const localEmail = String(localPatient?.email || '').trim().toLowerCase();
    const centralAddress = String(centralPatient?.endereco || centralPatient?.address || '').trim().toLowerCase();
    const localAddress = String(localPatient?.endereco || localPatient?.address || '').trim().toLowerCase();

    return (!!localPhone && centralPhone !== localPhone)
      || (!!localEmail && centralEmail !== localEmail)
      || (!!localAddress && centralAddress !== localAddress);
  };

  const ensureCentralPatientForAppointment = async (appointment = {}) => {
    const localPatientKey = String(
      appointment?.prontuario || appointment?.pacienteId || appointment?.patientId || ''
    ).trim();
    let localPatient = null;

    if (!localPatientKey || !isCentralEnabled()) {
      return {
        centralPatientId: String(appointment?.patientId || '').trim(),
        appointmentPayload: { ...appointment },
      };
    }

    if (typeof readPatient === 'function') {
      try {
        localPatient = await readPatient(localPatientKey);
      } catch (_) {
        localPatient = null;
      }
    }

    console.info('[AGENDA] local patient resolved', JSON.stringify({
      localPatientKey,
      clinicId: appointment?.clinicId || '',
      localPatientId: localPatient?.id || '',
      localPatientProntuario: localPatient?.prontuario || '',
      localPatientName: localPatient?.nome || localPatient?.fullName || '',
    }));

    let centralPatient = null;
    const centralCandidateIds = [
      localPatient?.id,
      localPatientKey,
      appointment?.patientId,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    for (const candidateId of centralCandidateIds) {
      try {
        centralPatient = await centralBackendAdapter.getPatientById(candidateId, {
          clinicId: appointment?.clinicId || getCurrentClinicId(),
        });
      } catch (_) {
        centralPatient = null;
      }
      if (centralPatient) break;
    }

    console.info('[AGENDA] central patient lookup result', JSON.stringify({
      localPatientKey,
      candidateIds: centralCandidateIds,
      found: !!centralPatient,
      centralPatientId: centralPatient?.id || '',
    }));

    if (centralPatient && localPatient && hasPatientContactDiff(centralPatient, localPatient)) {
      centralPatient = await centralBackendAdapter.updatePatient(centralPatient.id, {
        ...localPatient,
        id: centralPatient.id,
      }, {
        clinicId: appointment?.clinicId || getCurrentClinicId(),
      });
      console.info('[AGENDA] central patient updated from local', JSON.stringify({
        localPatientKey,
        centralPatientId: centralPatient?.id || '',
      }));
    }

    if (!centralPatient) {
      if (!localPatient) {
        throw new Error('Paciente local sem vinculo central e leitura local indisponivel.');
      }

      console.info('[AGENDA] central patient sync required', JSON.stringify({
        localPatientKey,
        clinicId: appointment?.clinicId || '',
        patientName: localPatient?.nome || localPatient?.fullName || '',
      }));

      centralPatient = await centralBackendAdapter.createPatient(localPatient, {
        clinicId: appointment?.clinicId || getCurrentClinicId(),
      });
      console.info('[AGENDA] central patient created result', JSON.stringify({
        localPatientKey,
        centralPatientId: centralPatient?.id || '',
        clinicId: centralPatient?.clinicId || '',
      }));

      if (typeof savePatient === 'function') {
        try {
          await savePatient({
            ...localPatient,
            id: centralPatient.id,
            prontuario: localPatient.prontuario || localPatientKey,
          });
          console.info('[AGENDA]', JSON.stringify({
            module: 'agenda',
            operation: 'shadow-sync-patient',
            clinicId: appointment?.clinicId || getCurrentClinicId(),
            patientId: centralPatient.id,
            shadow_write_executed: true,
          }));
        } catch (shadowError) {
          console.warn('[AGENDA] shadow write local patient id failed', shadowError?.message || shadowError);
        }
      }
    }

    const centralPatientId = String(centralPatient?.id || '').trim();
    console.info('[AGENDA] central patient chosen', JSON.stringify({
      localPatientKey,
      centralPatientId,
      clinicId: appointment?.clinicId || '',
    }));
    return {
      centralPatientId,
      appointmentPayload: {
        ...appointment,
        patientId: centralPatientId || String(appointment?.patientId || '').trim(),
      },
    };
  };

  const resolveCentralPatientForConsultasSync = async (patientKey = '') => {
    const localPatientKey = String(patientKey || '').trim();
    let localPatient = null;
    if (!localPatientKey) {
      return { localPatient: null, centralPatient: null };
    }
    if (typeof readPatient === 'function') {
      try {
        localPatient = await readPatient(localPatientKey);
      } catch (_) {
        localPatient = null;
      }
    }

    const candidateIds = [
      localPatient?.id,
      localPatient?.prontuario,
      localPatient?._id,
      localPatientKey,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    let centralPatient = null;
    for (const candidateId of candidateIds) {
      try {
        centralPatient = await centralBackendAdapter.getPatientById(candidateId, {
          clinicId: getCurrentClinicId(),
        });
      } catch (_) {
        centralPatient = null;
      }
      if (centralPatient) break;
    }

    return { localPatient, centralPatient };
  };

  const mapAppointmentToConsulta = (appointment = {}) => ({
    id: appointment.id,
    appointmentId: appointment.id || appointment.appointmentId || '',
    clinicId: appointment.clinicId || getCurrentClinicId(),
    patientId: appointment.patientId || appointment.pacienteId || appointment.prontuario || '',
    prontuario: appointment.prontuario || appointment.patientId || appointment.pacienteId || '',
    data: appointment.data || '',
    horaInicio: appointment.horaInicio || '',
    horaFim: appointment.horaFim || '',
    tipo: appointment.tipo || 'Consulta',
    status: appointment.status || 'em_aberto',
    attendanceStatus: appointment.attendanceStatus || '',
    dentistaId: appointment.dentistaId || '',
    dentistaNome: appointment.dentistaNome || '',
    observacoes: appointment.observacoes || '',
    marcadorId: appointment.marcadorId || '',
    marcadorNome: appointment.marcadorNome || '',
    marcadorCor: appointment.marcadorCor || '',
  });

  const sendWhatsappResult = async (created) => {
    let whatsapp = { attempted: false, success: false };
    if (created && typeof sendAppointmentConfirmation === 'function') {
      try {
        const patient = {
          prontuario: created?.prontuario || created?.pacienteId || created?.patientId || '',
          nome: created?.pacienteNome || created?.paciente || '',
          telefone: created?.telefone || '',
        };
        const result = await sendAppointmentConfirmation({
          appointment: created,
          patient,
        });
        whatsapp = {
          attempted: true,
          success: result?.success === true,
          error: result?.error || '',
        };
      } catch (err) {
        console.warn('[AGENDA] falha ao enviar confirmacao automatica:', err?.message || err);
        whatsapp = {
          attempted: true,
          success: false,
          error: err?.message || String(err),
        };
      }
    }

    return {
      ...created,
      __whatsapp: whatsapp,
    };
  };

  ipcMain.handle('agenda-get-range', async (_event, { start, end }) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.view'] });
    if (!isCentralEnabled()) return agendaGetRange({ start, end });

    try {
      logCentralActive();
      const currentClinicId = getCurrentClinicId();
      const centralAppointments = await centralBackendAdapter.getAppointments({
        clinicId: currentClinicId,
        start,
        end,
      });
      logLoadedFromCentral('range', {
        count: centralAppointments.length,
      });
      return markCentralAppointments(centralAppointments);
    } catch (error) {
      logCentralUnavailable(error);
      if (!shouldFallbackToLocal(error)) throw error;
      const legacyAppointments = await agendaGetRange({ start, end });
      logFallback('range', error?.message || String(error));
      return markLegacyAppointments(legacyAppointments);
    }
  });

  ipcMain.handle('agenda-get-day', async (_event, payload) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.view'] });
    if (!isCentralEnabled()) return agendaGetDay(payload);

    try {
      logCentralActive();
      const currentClinicId = getCurrentClinicId();
      const centralAppointments = await centralBackendAdapter.getAppointments({
        clinicId: currentClinicId,
        date: payload?.date || payload,
      });
      logLoadedFromCentral('day', {
        count: centralAppointments.length,
      });
      return markCentralAppointments(centralAppointments);
    } catch (error) {
      logCentralUnavailable(error);
      if (!shouldFallbackToLocal(error)) throw error;
      const legacyAppointments = await agendaGetDay(payload);
      logFallback('day', error?.message || String(error));
      return markLegacyAppointments(legacyAppointments);
    }
  });

  ipcMain.handle('agenda-add', async (_event, appt) => {
    console.info('[AGENDA] agenda-add started', JSON.stringify({
      id: appt?.id || '',
      clinicId: appt?.clinicId || '',
      prontuario: appt?.prontuario || '',
      pacienteId: appt?.pacienteId || '',
      patientId: appt?.patientId || '',
      data: appt?.data || '',
      horaInicio: appt?.horaInicio || '',
      dentistaId: appt?.dentistaId || '',
    }));
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.edit'] });
    if (!isCentralEnabled()) {
      const created = await agendaAdd(appt);
      return sendWhatsappResult(created);
    }

    try {
      logCentralActive();
      const { appointmentPayload, centralPatientId } = await ensureCentralPatientForAppointment(appt);
      console.info('[AGENDA] central create payload resolved', JSON.stringify({
        clinicId: appointmentPayload?.clinicId || '',
        localAppointmentId: appt?.id || '',
        localPatientKey: appt?.prontuario || appt?.pacienteId || appt?.patientId || '',
        centralPatientId,
        data: appointmentPayload?.data || '',
        horaInicio: appointmentPayload?.horaInicio || '',
        dentistaId: appointmentPayload?.dentistaId || '',
      }));

      console.info('[AGENDA] central appointment create started', JSON.stringify({
        clinicId: appointmentPayload?.clinicId || '',
        patientId: appointmentPayload?.patientId || '',
        data: appointmentPayload?.data || '',
        horaInicio: appointmentPayload?.horaInicio || '',
      }));
      const created = await centralBackendAdapter.createAppointment({
        ...appointmentPayload,
        clinicId: appointmentPayload?.clinicId || getCurrentClinicId(),
      });
      console.info('[AGENDA] central appointment create result', JSON.stringify({
        source: created?.source || created?.__source || '',
        id: created?.id || '',
        clinicId: created?.clinicId || '',
        patientId: created?.patientId || created?.pacienteId || '',
        data: created?.data || '',
        horaInicio: created?.horaInicio || '',
      }));

      try {
        await agendaAdd({
          ...appointmentPayload,
          id: created?.id || appt?.id,
        });
        console.info('[AGENDA]', JSON.stringify({
          module: 'agenda',
          operation: 'create',
          clinicId: created?.clinicId || appointmentPayload?.clinicId || getCurrentClinicId(),
          appointmentId: created?.id || appt?.id || '',
          shadow_write_executed: true,
        }));
      } catch (shadowError) {
        console.warn('[AGENDA] shadow write local failed', shadowError?.message || shadowError);
      }

      console.info('[AGENDA] final appointment source', JSON.stringify({
        source: SOURCE.CENTRAL,
        id: created?.id || '',
      }));
      return sendWhatsappResult(withSource(created, SOURCE.CENTRAL));
    } catch (error) {
      logCentralUnavailable(error);
      console.warn('[AGENDA] central create failed', JSON.stringify({
        message: error?.message || String(error),
        code: error?.code || '',
        status: error?.status || '',
        clinicId: appt?.clinicId || '',
        patientKey: appt?.prontuario || appt?.pacienteId || appt?.patientId || '',
        data: appt?.data || '',
        horaInicio: appt?.horaInicio || '',
      }));
      throw error;
    }
  });

  ipcMain.handle('agenda-update', async (_event, { id, appt }) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.edit'] });
    const normalizedUpdateKeys = Object.keys(appt || {})
      .filter((key) => appt?.[key] !== undefined && appt?.[key] !== null)
      .filter((key) => !['clinicId', '__source', 'source'].includes(String(key || '').trim()));
    const statusOnlyUpdate = normalizedUpdateKeys.length === 1
      && Object.prototype.hasOwnProperty.call(appt || {}, 'status');
    const attendanceOnlyUpdate = normalizedUpdateKeys.length === 1
      && Object.prototype.hasOwnProperty.call(appt || {}, 'attendanceStatus');
    if (!isCentralEnabled()) {
      return agendaUpdate({ id, appt });
    }

    try {
      logCentralActive();
      const currentClinicId = String(appt?.clinicId || getCurrentClinicId()).trim() || getCurrentClinicId();
      const updated = statusOnlyUpdate
        ? await centralBackendAdapter.updateAppointmentStatus(id, appt?.status, { clinicId: currentClinicId })
        : attendanceOnlyUpdate
          ? await centralBackendAdapter.updateAppointmentAttendance(id, appt?.attendanceStatus, { clinicId: currentClinicId })
        : await centralBackendAdapter.updateAppointment(id, {
            ...appt,
            id,
            clinicId: currentClinicId,
          });

      try {
        await agendaUpdate({ id, appt });
        console.info('[AGENDA]', JSON.stringify({
          module: 'agenda',
          operation: statusOnlyUpdate ? 'update-status' : (attendanceOnlyUpdate ? 'update-attendance' : 'update'),
          clinicId: currentClinicId,
          appointmentId: id,
          shadow_write_executed: true,
        }));
      } catch (shadowError) {
        console.warn('[AGENDA] shadow write local failed', shadowError?.message || shadowError);
      }
      return withSource(updated, SOURCE.CENTRAL);
    } catch (error) {
      logCentralUnavailable(error);
      throw error;
    }
  });

  ipcMain.handle('agenda-delete', async (_event, payload) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'recepcao'], perms: ['agenda.edit'] });
    const appointment = typeof payload === 'object' ? (payload?.appointment || payload) : { id: payload };
    const id = String(appointment?.id || '').trim();
    const clinicId = String(appointment?.clinicId || getCurrentClinicId()).trim() || getCurrentClinicId();
    if (!isCentralEnabled()) return agendaDelete({ id });

    try {
      logCentralActive();
      console.info('[AGENDA] delete requested', JSON.stringify({
        id,
        clinicId,
        source: appointment?.__source || appointment?.source || '',
      }));
      const result = await centralBackendAdapter.deleteAppointment({
        id,
        clinicId,
        appointment,
      });
      try {
        await agendaDelete({ id });
        console.info('[AGENDA]', JSON.stringify({
          module: 'agenda',
          operation: 'delete',
          clinicId,
          appointmentId: id,
          shadow_write_executed: true,
        }));
      } catch (shadowError) {
        console.warn('[AGENDA] shadow delete local failed', shadowError?.message || shadowError);
      }
      return result;
    } catch (error) {
      logCentralUnavailable(error);
      console.warn('[AGENDA] central delete failed', JSON.stringify({
        id,
        clinicId,
        source: appointment?.__source || appointment?.source || '',
        error: error?.message || String(error),
        code: error?.code || '',
      }));
      throw error;
    }
  });

  ipcMain.handle('agenda-sync-consultas', async (_event, patientKey) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.edit'] });
    if (!isCentralEnabled()) return agendaSyncConsultas(patientKey);
    try {
      logCentralActive();
      const { localPatient, centralPatient } = await resolveCentralPatientForConsultasSync(patientKey);
      if (centralPatient?.id) {
        const appointments = await centralBackendAdapter.getAppointments({
          clinicId: getCurrentClinicId(),
          patientId: centralPatient.id,
        });
        const consultas = sortAppointments(appointments).map(mapAppointmentToConsulta);
        if (localPatient?.prontuario && typeof savePatient === 'function') {
          try {
            await savePatient({
              ...localPatient,
              prontuario: localPatient.prontuario,
              consultas,
            });
          } catch (shadowError) {
            console.warn('[AGENDA] consultas shadow sync failed', shadowError?.message || shadowError);
          }
        }
        console.info('[AGENDA] consultas_sync_source=central', JSON.stringify({
          clinicId: getCurrentClinicId(),
          patientId: centralPatient.id,
          total: consultas.length,
        }));
        return {
          total: consultas.length,
          consultas,
          source: SOURCE.CENTRAL,
        };
      }
    } catch (error) {
      logCentralUnavailable(error);
      if (!shouldFallbackToLocal(error)) throw error;
      logFallback('sync-consultas', error?.message || String(error));
    }
    return agendaSyncConsultas(patientKey);
  });

  ipcMain.handle('agenda-open-day-view', async (_event, date) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.view'] });
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js') },
    });

    await win.loadFile('agenda-dia.html');

    win.webContents.on('did-finish-load', () => {
      win.webContents.send('agenda-day-data', date);
    });
  });
};

module.exports = { registerAgendaHandlers };
