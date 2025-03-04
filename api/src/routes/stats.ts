import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { MonitoringService } from '../services/monitoring.service';
import { authenticate, authorize } from '../middlewares/auth.middleware';

// Schéma pre parametre súboru
const fileParamSchema = z.object({
  fileId: z.string().uuid('Neplatné ID súboru')
});

// Vytvor router pre štatistiky
const router = new Hono();

// Middleware pre autentifikáciu - všetky endpointy vyžadujú prihlásenie
router.use('*', authenticate);

// Získaj štatistiky prístupu k súboru
router.get('/file/:fileId', zValidator('param', fileParamSchema), async (c) => {
  const { fileId } = c.req.valid('param');

  const stats = await MonitoringService.getFileAccessStats(fileId);

  return c.json(stats);
});

// Získaj celkové štatistiky systému - iba pre admin a manažérov
router.get('/system', authorize(['ADMIN', 'MANAGER']), async (c) => {
  const stats = await MonitoringService.getSystemStats();

  return c.json(stats);
});

// Získaj informácie o serverovom procese - iba pre admin
router.get('/process', authorize(['ADMIN']), async (c) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();

  const stats = {
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers
    },
    uptime,
    version: process.version,
    pid: process.pid,
    env: process.env.NODE_ENV
  };

  return c.json(stats);
});

export { router as statsRouter };
