import { Router } from 'express';
import {
  exportClinicIncident,
  getClinicReadiness,
  getOperationsOverview,
  getSecurityOverview,
  getSettingsOverview,
  getWebhookOverview,
  listAdminAudit,
  listOperationalEvents,
  listRecentLogs,
  resetSettingsOverview,
  updateSettingsOverview,
} from '../controllers/supportController';

export const supportRoutes = Router();

supportRoutes.get('/logs/recent', listRecentLogs);
supportRoutes.get('/operational-events/recent', listOperationalEvents);
supportRoutes.get('/security/audit', listAdminAudit);
supportRoutes.get('/operations/overview', getOperationsOverview);
supportRoutes.get('/operations/clinic-readiness', getClinicReadiness);
supportRoutes.get('/operations/export', exportClinicIncident);
supportRoutes.get('/webhooks/overview', getWebhookOverview);
supportRoutes.get('/security/overview', getSecurityOverview);
supportRoutes.get('/settings/overview', getSettingsOverview);
supportRoutes.post('/settings/overview', updateSettingsOverview);
supportRoutes.post('/settings/reset', resetSettingsOverview);
