import { Router } from 'express';
import {
  createAdminSession,
  deleteAdminSession,
  getAdminSession,
  getAdminAppPage,
  getAdminLoginPage,
} from '../controllers/adminController';
import { adminSessionMiddleware } from '../services/auth/authorizationService';

export const adminRoutes = Router();

adminRoutes.get('/login', getAdminLoginPage);
adminRoutes.get('/session', getAdminSession);
adminRoutes.post('/session', createAdminSession);
adminRoutes.delete('/session', deleteAdminSession);
adminRoutes.get('/', adminSessionMiddleware, getAdminAppPage);
adminRoutes.get('/instances', adminSessionMiddleware, getAdminAppPage);
adminRoutes.get('*', adminSessionMiddleware, getAdminAppPage);
