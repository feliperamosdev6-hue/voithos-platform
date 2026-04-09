import { Router } from 'express';
import { instanceRoutes } from './instanceRoutes';
import { messageRoutes } from './messageRoutes';
import { supportRoutes } from './supportRoutes';

export const apiRoutes = Router();

apiRoutes.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

apiRoutes.use('/instances', instanceRoutes);
apiRoutes.use('/messages', messageRoutes);
apiRoutes.use('/', supportRoutes);
