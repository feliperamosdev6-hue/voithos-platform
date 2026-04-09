import { Router } from 'express';
import {
  getMessageSummary,
  listMessageJobs,
  sendMessage,
  sendMessageSync,
} from '../controllers/messageController';

export const messageRoutes = Router();

messageRoutes.get('/summary', getMessageSummary);
messageRoutes.get('/jobs', listMessageJobs);
messageRoutes.post('/send', sendMessage);
messageRoutes.post('/send-sync', sendMessageSync);
