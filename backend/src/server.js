require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { AppError } = require('./errors/AppError');
const clinicRoutes = require('./routes/clinicRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const userRoutes = require('./routes/userRoutes');
const patientRoutes = require('./routes/patientRoutes');
const clinicalRoutes = require('./routes/clinicalRoutes');
const financialRoutes = require('./routes/financialRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const relationshipRoutes = require('./routes/relationshipRoutes');
const stockRoutes = require('./routes/stockRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const automationRoutes = require('./routes/automationRoutes');
const authRoutes = require('./routes/authRoutes');
const inboundMessageRoutes = require('./routes/inboundMessageRoutes');
const internalAutomationRoutes = require('./routes/internalAutomationRoutes');
const internalAppointmentRoutes = require('./routes/internalAppointmentRoutes');
const internalClinicRoutes = require('./routes/internalClinicRoutes');
const internalIdentityRoutes = require('./routes/internalIdentityRoutes');
const internalPatientClinicalRoutes = require('./routes/internalPatientClinicalRoutes');
const internalFinancialRoutes = require('./routes/internalFinancialRoutes');
const internalLaboratoryRoutes = require('./routes/internalLaboratoryRoutes');
const internalNotificationEventRoutes = require('./routes/internalNotificationEventRoutes');
const internalPatientRoutes = require('./routes/internalPatientRoutes');
const internalRelationshipRoutes = require('./routes/internalRelationshipRoutes');
const outboundMessageRoutes = require('./routes/outboundMessageRoutes');
const internalWhatsappRoutes = require('./routes/internalWhatsappRoutes');
const notificationEventRoutes = require('./routes/notificationEventRoutes');
const publicAppointmentActionRoutes = require('./routes/publicAppointmentActionRoutes');
const { startAppointmentReminderScheduler } = require('./services/appointmentReminderSchedulerService');
const { startPlanMessageScheduler } = require('./services/planMessageSchedulerService');
const { errorHandler } = require('./middlewares/errorHandler');

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED_REJECTION', reason);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT_EXCEPTION', err);
});

const app = express();
const port = Number(process.env.PORT || 4000);
const legacySqliteApiEnabled = String(process.env.LEGACY_SQLITE_API_ENABLED || '').trim().toLowerCase() === 'true';

const corsOriginAllowlist = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
]);

const addCorsOrigins = (rawValue, label) => {
  String(rawValue || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((value) => {
      try {
        corsOriginAllowlist.add(new URL(value).origin);
      } catch (_error) {
        console.warn(`[backend] invalid ${label} entry for CORS allowlist`);
      }
    });
};

addCorsOrigins(process.env.PUBLIC_APP_BASE_URL, 'PUBLIC_APP_BASE_URL');
addCorsOrigins(process.env.PUBLIC_APP_ALLOWED_ORIGINS, 'PUBLIC_APP_ALLOWED_ORIGINS');

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (corsOriginAllowlist.has(origin)) {
      callback(null, true);
      return;
    }
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new AppError(403, 'CORS_ORIGIN_BLOCKED', `CORS origin blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '40mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'voithos-central-backend',
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/r', publicAppointmentActionRoutes);
app.use('/clinics', clinicRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/users', userRoutes);
app.use('/patients', patientRoutes);
app.use('/clinical', clinicalRoutes);
app.use('/financial', financialRoutes);
app.use('/payments', paymentRoutes);
app.use('/subscription', subscriptionRoutes);
app.use('/relationships', relationshipRoutes);
app.use('/stock', stockRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/automation', automationRoutes);
app.use('/inbound-messages', inboundMessageRoutes);
app.use('/notifications', notificationEventRoutes);
app.use('/outbound-messages', outboundMessageRoutes);
app.use('/internal/automation', internalAutomationRoutes);
app.use('/internal/appointments', internalAppointmentRoutes);
app.use('/internal/clinics', internalClinicRoutes);
app.use('/internal/identity', internalIdentityRoutes);
app.use('/internal/clinical', internalPatientClinicalRoutes);
app.use('/internal/financial', internalFinancialRoutes);
app.use('/internal/laboratory', internalLaboratoryRoutes);
app.use('/internal/notifications', internalNotificationEventRoutes);
app.use('/internal/patients', internalPatientRoutes);
app.use('/internal/relationships', internalRelationshipRoutes);
app.use('/internal/whatsapp', internalWhatsappRoutes);
app.use('/auth', authRoutes);

if (legacySqliteApiEnabled) {
  const { initDb } = require('./db');
  const patientsRouter = require('./routes/patients');
  const authRouter = require('./routes/auth');
  initDb();
  app.use('/api/patients', patientsRouter);
  app.use('/api/auth', authRouter);
  console.log('[backend] legacy sqlite API enabled');
}

app.use(errorHandler);

startAppointmentReminderScheduler();
startPlanMessageScheduler();

app.listen(port, () => {
  console.log(`[backend] listening on http://127.0.0.1:${port}`);
});
