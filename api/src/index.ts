/* eslint-disable no-console */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { cors } from 'hono/cors';
import { PrismaClient } from '@prisma/client';

import { filesRouter } from './routes/files';
import { foldersRouter } from './routes/folders';
import { authRouter } from './routes/auth';
import { webhookRouter } from './routes/webhooks';
import { variantRouter } from './routes/variants';
import { versionRouter } from './routes/versions';
import { statsRouter } from './routes/stats';
import { errorHandler } from './middlewares/error-handler';
import { config } from './config';
import { monitoringMiddleware, metricsHandler } from './services/monitoring.service';

// Inicializácia Prisma klienta
const prisma = new PrismaClient();

// Hlavná aplikácia
const app = new Hono();

// Globálne middlewares
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: config.corsAllowedOrigins,
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
}));

// Monitoring middleware (Prometheus metriky)
app.use('*', monitoringMiddleware);

// Health check endpoint
app.get('/health', (c) => c.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: process.env.npm_package_version || '1.0.0',
  features: config.features
}));

// Metriky endpoint (Prometheus)
if (config.features.monitoring) {
  app.get('/metrics', metricsHandler);
}

// API routes
app.route('/api/auth', authRouter);
app.route('/api/files', filesRouter);
app.route('/api/folders', foldersRouter);

// Rozšírené funkcionality
if (config.features.webhooks) {
  app.route('/api/webhooks', webhookRouter);
}

if (config.features.versioning) {
  app.route('/api/versions', versionRouter);
}

if (config.features.imageProcessing) {
  app.route('/api/variants', variantRouter);
}

if (config.features.monitoring) {
  app.route('/api/stats', statsRouter);
}

// Globálny error handler
app.onError(errorHandler);

// Spustenie servera
const port = config.port;
console.log(`Server starting on port ${port}...`);
console.log('Enabled features:', JSON.stringify(config.features, null, 2));

// Cleanup funkcia pre graceful shutdown
const cleanup = async () => {
  console.log('Shutting down server...');
  try {
    await prisma.$disconnect();
    console.log('Database disconnected');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
  process.exit(0);
};

// Zaregistruj handlery pre graceful shutdown
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Spusti server
serve({
  fetch: app.fetch,
  port
});
