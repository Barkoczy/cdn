import { PrismaClient } from '@prisma/client';
import { Context } from 'hono';
import { config } from '../config';
import * as promClient from 'prom-client';
const { register } = promClient;
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password
});

// Inicializácia Prometheus metrík
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Doba trvania HTTP požiadaviek v ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] // v ms
});

const httpRequestsTotalCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Celkový počet HTTP požiadaviek',
  labelNames: ['method', 'route', 'status_code']
});

const fileUploadsCounter = new promClient.Counter({
  name: 'file_uploads_total',
  help: 'Celkový počet nahraných súborov',
  labelNames: ['mime_type']
});

const fileDownloadsCounter = new promClient.Counter({
  name: 'file_downloads_total',
  help: 'Celkový počet stiahnutí súborov',
  labelNames: ['mime_type']
});

const fileSizeHistogram = new promClient.Histogram({
  name: 'file_size_bytes',
  help: 'Veľkosť nahraných súborov v bajtoch',
  labelNames: ['mime_type'],
  buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600] // 1KB, 10KB, 100KB, 1MB, 10MB, 100MB
});

const processingDurationHistogram = new promClient.Histogram({
  name: 'image_processing_duration_ms',
  help: 'Doba spracovania obrázkov v ms',
  labelNames: ['variant'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000] // v ms
});

const storageUsageGauge = new promClient.Gauge({
  name: 'storage_usage_bytes',
  help: 'Celkové využitie úložiska v bajtoch'
});

// Monitorovanie vlastného počítača
const processMemoryGauge = new promClient.Gauge({
  name: 'process_memory_bytes',
  help: 'Využitie pamäte procesom v bajtoch',
  labelNames: ['type']
});

const redisConnectionsGauge = new promClient.Gauge({
  name: 'redis_connections',
  help: 'Počet Redis pripojení'
});

/**
 * Service pre monitorovanie a metriky
 */
export class MonitoringService {
  /**
   * Middleware pre meranie dĺžky HTTP požiadaviek
   */
  static httpMetricsMiddleware() {
    if (!config.features.monitoring) {
      return async (c: Context, next: () => Promise<void>) => await next();
    }

    return async (c: Context, next: () => Promise<void>) => {
      const start = Date.now();
      const { method, path } = c.req;

      try {
        await next();
      } finally {
        const status = c.res.status || 200;
        const duration = Date.now() - start;

        // Zjednodušená cesta pre metriky (bez param hodnôt)
        const route = path.replace(/\/[^/]+$/, '/:id');

        // Zaznamenaj metriky
        httpRequestDurationMicroseconds.labels(method, route, status.toString()).observe(duration);
        httpRequestsTotalCounter.labels(method, route, status.toString()).inc();
      }
    };
  }

  /**
   * Zaznamenáva nahratie súboru
   */
  static recordFileUpload(mimeType: string, sizeBytes: number): void {
    if (!config.features.monitoring) return;

    fileUploadsCounter.labels(mimeType).inc();
    fileSizeHistogram.labels(mimeType).observe(sizeBytes);
  }

  /**
   * Zaznamenáva stiahnutie súboru
   */
  static recordFileDownload(mimeType: string): void {
    if (!config.features.monitoring) return;

    fileDownloadsCounter.labels(mimeType).inc();
  }

  /**
   * Zaznamenáva trvanie spracovania obrázka
   */
  static recordImageProcessingDuration(variant: string, durationMs: number): void {
    if (!config.features.monitoring) return;

    processingDurationHistogram.labels(variant).observe(durationMs);
  }

  /**
   * Získa endpoint s Prometheus metrikami
   */
  static getMetricsHandler() {
    return async (c: Context) => {
      // Aktualizuj niektoré metriky pred odpoveďou
      await MonitoringService.updateDynamicMetrics();

      // Vráť aktuálne metriky vo formáte pre Prometheus
      const metrics = await register.metrics();
      return c.text(metrics);
    };
  }

  /**
   * Aktualizuje dynamické metriky ako využitie úložiska, pamäť, atď.
   */
  private static async updateDynamicMetrics(): Promise<void> {
    try {
      // Využitie úložiska - sčítaj veľkosti všetkých súborov
      const totalSize = await prisma.file.aggregate({
        _sum: {
          size: true
        }
      });

      if (totalSize._sum.size !== null) {
        storageUsageGauge.set(totalSize._sum.size);
      }

      // Sleduj využitie pamäte procesom
      const memoryUsage = process.memoryUsage();
      processMemoryGauge.labels('rss').set(memoryUsage.rss);
      processMemoryGauge.labels('heapTotal').set(memoryUsage.heapTotal);
      processMemoryGauge.labels('heapUsed').set(memoryUsage.heapUsed);
      processMemoryGauge.labels('external').set(memoryUsage.external);

      // Redis klienti
      try {
        const redisInfo = await redis.info();
        const connectedClientsMatch = redisInfo.match(/connected_clients:(\d+)/);
        if (connectedClientsMatch && connectedClientsMatch[1]) {
          redisConnectionsGauge.set(parseInt(connectedClientsMatch[1], 10));
        }
      } catch (error) {
        console.error('Nepodarilo sa získať Redis info:', error);
      }
    } catch (error) {
      console.error('Chyba pri aktualizácii metrík:', error);
    }
  }

  /**
   * Spúšťa pravidelné aktualizácie metrík
   */
  static startPeriodicMetricsUpdate(): NodeJS.Timeout {
    if (!config.features.monitoring) return setTimeout(() => {}, 0) as unknown as NodeJS.Timeout;

    // Aktualizuj metriky každých 60 sekúnd
    return setInterval(() => {
      MonitoringService.updateDynamicMetrics().catch(error => {
        console.error('Chyba pri pravidelnej aktualizácii metrík:', error);
      });
    }, 60000);
  }

  /**
   * Zaznamenáva prístup k súboru do databázy pre neskoršiu analýzu
   */
  static async recordFileAccess(
    fileId: string,
    ip?: string,
    userAgent?: string,
    referer?: string,
    userId?: string
  ): Promise<void> {
    if (!config.features.monitoring) return;

    try {
      await prisma.fileAccess.create({
        data: {
          fileId,
          ip,
          userAgent,
          referer,
          userId
        }
      });
    } catch (error) {
      console.error('Chyba pri zaznamenávaní prístupu k súboru:', error);
      // Nepremieta chybu nahor, iba loguje - nemalo by blokovať hlavnú operáciu
    }
  }

  /**
   * Získa štatistiky prístupu k súboru
   */
  static async getFileAccessStats(fileId: string): Promise<{
    totalAccesses: number;
    uniqueIPs: number;
    lastAccess: Date | null;
    topReferers: { referer: string; count: number }[];
    accessesByDay: { date: string; count: number }[];
  }> {
    if (!config.features.monitoring) {
      return {
        totalAccesses: 0,
        uniqueIPs: 0,
        lastAccess: null,
        topReferers: [],
        accessesByDay: []
      };
    }

    try {
      // Celkový počet prístupov
      const totalAccesses = await prisma.fileAccess.count({
        where: { fileId }
      });

      // Počet unikátnych IP adries
      const uniqueIPsResult = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT ip) as count 
        FROM file_accesses 
        WHERE file_id = ${fileId} AND ip IS NOT NULL
      `;
      const uniqueIPs = Number(uniqueIPsResult[0]?.count || 0);

      // Posledný prístup
      const lastAccessResult = await prisma.fileAccess.findFirst({
        where: { fileId },
        orderBy: { accessTime: 'desc' },
        select: { accessTime: true }
      });
      const lastAccess = lastAccessResult?.accessTime || null;

      // Top 5 refererov
      const topReferers = await prisma.$queryRaw<{ referer: string; count: bigint }[]>`
        SELECT referer, COUNT(*) as count
        FROM file_accesses
        WHERE file_id = ${fileId} AND referer IS NOT NULL
        GROUP BY referer
        ORDER BY count DESC
        LIMIT 5
      `;

      // Počet prístupov podľa dní za posledných 30 dní
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const accessesByDay = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT 
          DATE_TRUNC('day', access_time) as date,
          COUNT(*) as count
        FROM file_accesses
        WHERE file_id = ${fileId} AND access_time >= ${thirtyDaysAgo}
        GROUP BY DATE_TRUNC('day', access_time)
        ORDER BY date ASC
      `;

      return {
        totalAccesses,
        uniqueIPs,
        lastAccess,
        topReferers: topReferers.map(r => ({
          referer: r.referer,
          count: Number(r.count)
        })),
        accessesByDay: accessesByDay.map(a => ({
          date: a.date,
          count: Number(a.count)
        }))
      };
    } catch (error) {
      console.error('Chyba pri získavaní štatistík prístupu:', error);
      return {
        totalAccesses: 0,
        uniqueIPs: 0,
        lastAccess: null,
        topReferers: [],
        accessesByDay: []
      };
    }
  }

  /**
   * Získa celkové štatistiky systému
   */
  static async getSystemStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    totalUsers: number;
    filesByType: { mimeType: string; count: number }[];
    uploadsByDay: { date: string; count: number }[];
    totalDownloads: number;
  }> {
    if (!config.features.monitoring) {
      return {
        totalFiles: 0,
        totalSize: 0,
        totalUsers: 0,
        filesByType: [],
        uploadsByDay: [],
        totalDownloads: 0
      };
    }

    try {
      // Celkový počet súborov
      const totalFiles = await prisma.file.count();

      // Celková veľkosť súborov
      const sizeResult = await prisma.file.aggregate({
        _sum: { size: true }
      });
      const totalSize = sizeResult._sum.size || 0;

      // Celkový počet používateľov
      const totalUsers = await prisma.user.count();

      // Súbory podľa MIME typu
      const filesByType = await prisma.$queryRaw<{ mime_type: string; count: bigint }[]>`
        SELECT mime_type, COUNT(*) as count
        FROM files
        GROUP BY mime_type
        ORDER BY count DESC
        LIMIT 10
      `;

      // Počet nahraní podľa dní za posledných 30 dní
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const uploadsByDay = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*) as count
        FROM files
        WHERE created_at >= ${thirtyDaysAgo}
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date ASC
      `;

      // Celkový počet stiahnutí
      const totalDownloads = await prisma.fileAccess.count();

      return {
        totalFiles,
        totalSize,
        totalUsers,
        filesByType: filesByType.map(f => ({
          mimeType: f.mime_type,
          count: Number(f.count)
        })),
        uploadsByDay: uploadsByDay.map(u => ({
          date: u.date,
          count: Number(u.count)
        })),
        totalDownloads
      };
    } catch (error) {
      console.error('Chyba pri získavaní systémových štatistík:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        totalUsers: 0,
        filesByType: [],
        uploadsByDay: [],
        totalDownloads: 0
      };
    }
  }
}

// Inicializuj monitorovanie ak je povolené
if (config.features.monitoring) {
  MonitoringService.startPeriodicMetricsUpdate();
}

// Export pre použitie v aplikácii
export const monitoringMiddleware = MonitoringService.httpMetricsMiddleware();
export const metricsHandler = MonitoringService.getMetricsHandler();
