import { PrismaClient, WebhookEvent, Webhook } from '@prisma/client';
import { createHmac } from 'crypto';
import { config } from '../config';
import Queue from 'bull';
import axios from 'axios';
import { AppError } from '../middlewares/error-handler';
import { AxiosError } from 'axios';

const prisma = new PrismaClient();

// Bull queue pre asynchrónne odosielanie webhookov
const webhookQueue = new Queue('webhook-delivery', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password
  }
});

// Typy eventov pre webhooky
export enum WebhookEventType {
  FILE_CREATED = 'file.created',
  FILE_UPDATED = 'file.updated',
  FILE_DELETED = 'file.deleted',
  FILE_ACCESSED = 'file.accessed',
  FOLDER_CREATED = 'folder.created',
  FOLDER_UPDATED = 'folder.updated',
  FOLDER_DELETED = 'folder.deleted',
  VERSION_CREATED = 'version.created'
}

// Interface pre payload webhookov
export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Service pre prácu s webhookmi
 */
export class WebhookService {
  /**
   * Vytvorí nový webhook
   */
  async createWebhook(
    name: string,
    url: string,
    events: WebhookEventType[],
    userId: string,
    secret?: string
  ): Promise<Webhook> {
    try {
      // Validácia URL
      try {
        new URL(url);
      } catch {
        throw new AppError('Neplatná URL adresa', 400);
      }

      // Vytvor webhook v transakcii
      const webhook = await prisma.$transaction(async (tx) => {
        // Vytvor webhook
        const webhook = await tx.webhook.create({
          data: {
            name,
            url,
            secret,
            active: true,
            userId
          }
        });

        // Vytvor eventy pre webhook
        const eventPromises = events.map(event =>
          tx.webhookEvent.create({
            data: {
              event,
              webhookId: webhook.id
            }
          })
        );

        await Promise.all(eventPromises);

        return webhook;
      });

      return webhook;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa vytvoriť webhook: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Aktualizuje existujúci webhook
   */
  async updateWebhook(
    id: string,
    data: {
      name?: string;
      url?: string;
      secret?: string;
      active?: boolean;
      events?: WebhookEventType[];
    },
    userId: string
  ): Promise<Webhook> {
    try {
      // Skontroluj či webhook existuje a patrí používateľovi
      const existingWebhook = await prisma.webhook.findFirst({
        where: {
          id,
          userId
        },
        include: {
          events: true
        }
      });

      if (!existingWebhook) {
        throw new AppError('Webhook nebol nájdený alebo nemáte oprávnenie na jeho úpravu', 404);
      }

      // Validuj URL ak je poskytnutá
      if (data.url) {
        try {
          new URL(data.url);
        } catch {
          throw new AppError('Neplatná URL adresa', 400);
        }
      }

      // Aktualizuj webhook v transakcii
      const webhook = await prisma.$transaction(async (tx) => {
        // Aktualizuj základné údaje
        const webhook = await tx.webhook.update({
          where: { id },
          data: {
            name: data.name,
            url: data.url,
            secret: data.secret,
            active: data.active
          }
        });

        // Aktualizuj eventy ak sú poskytnuté
        if (data.events) {
          // Vymaž existujúce eventy
          await tx.webhookEvent.deleteMany({
            where: { webhookId: id }
          });

          // Vytvor nové eventy
          const eventPromises = data.events.map(event =>
            tx.webhookEvent.create({
              data: {
                event,
                webhookId: id
              }
            })
          );

          await Promise.all(eventPromises);
        }

        return webhook;
      });

      return webhook;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa aktualizovať webhook: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Vymaže webhook
   */
  async deleteWebhook(id: string, userId: string): Promise<void> {
    try {
      // Skontroluj či webhook existuje a patrí používateľovi
      const webhook = await prisma.webhook.findFirst({
        where: {
          id,
          userId
        }
      });

      if (!webhook) {
        throw new AppError('Webhook nebol nájdený alebo nemáte oprávnenie na jeho vymazanie', 404);
      }

      // Vymaž webhook (kaskádovo vymaže aj eventy a deliveries cez Prisma vzťahy)
      await prisma.webhook.delete({
        where: { id }
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa vymazať webhook: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Získa webhook podľa ID
   */
  async getWebhook(id: string, userId: string): Promise<Webhook & { events: WebhookEvent[] }> {
    try {
      const webhook = await prisma.webhook.findFirst({
        where: {
          id,
          userId
        },
        include: {
          events: true
        }
      });

      if (!webhook) {
        throw new AppError('Webhook nebol nájdený alebo nemáte oprávnenie na jeho zobrazenie', 404);
      }

      return webhook;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa získať webhook: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Získa všetky webhooky používateľa
   */
  async listWebhooks(userId: string): Promise<(Webhook & { events: WebhookEvent[] })[]> {
    try {
      const webhooks = await prisma.webhook.findMany({
        where: {
          userId
        },
        include: {
          events: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return webhooks;
    } catch (error) {
      throw new AppError(`Nepodarilo sa získať zoznam webhookov: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Odošle webhook event asynchrónne
   */
  async triggerEvent(eventType: WebhookEventType, data: Record<string, unknown>): Promise<void> {
    if (!config.features.webhooks) {
      return; // Webhooky sú vypnuté
    }

    try {
      // Nájdi všetky aktívne webhooky pre daný event
      const webhooks = await prisma.webhook.findMany({
        where: {
          active: true,
          events: {
            some: {
              event: eventType
            }
          }
        }
      });

      if (webhooks.length === 0) {
        return; // Žiadne aktívne webhooky pre tento event
      }

      // Vytvor payload pre webhook
      const payload: WebhookPayload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data
      };

      // Pridaj do fronty pre každý webhook
      for (const webhook of webhooks) {
        await webhookQueue.add('deliver', {
          webhookId: webhook.id,
          payload
        });
      }
    } catch (error) {
      console.error('Chyba pri triggeri webhook eventu:', error);
      // Pri triggeri nezastavujeme hlavnú operáciu, len logujeme chybu
    }
  }

  /**
   * Spracovanie fronty webhookov
   * Inicializuje spracovanie webhookov z Bull queue
   */
  static initializeProcessor(): void {
    if (!config.features.webhooks) {
      return; // Webhooky sú vypnuté
    }

    webhookQueue.process('deliver', async (job) => {
      const { webhookId, payload } = job.data;

      try {
        // Nájdi webhook
        const webhook = await prisma.webhook.findUnique({
          where: { id: webhookId }
        });

        if (!webhook || !webhook.active) {
          throw new Error('Webhook neaktívny alebo neexistuje');
        }

        // Priprav payload a podpis ak je nastavený secret
        const payloadString = JSON.stringify(payload);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'CDN-Webhook-Delivery',
          'X-Webhook-Event': payload.event
        };

        // Pridaj signature ak je nastavený secret
        if (webhook.secret) {
          const signature = createHmac('sha256', webhook.secret)
            .update(payloadString)
            .digest('hex');

          headers['X-Webhook-Signature'] = signature;
        }

        // Odošli webhook
        const response = await axios.post(webhook.url, payloadString, {
          headers,
          timeout: 10000, // 10s timeout
          maxRedirects: 0 // Žiadne presmerovania
        });

        // Ulož výsledok deliveries
        await prisma.webhookDelivery.create({
          data: {
            webhookId,
            event: payload.event,
            payload,
            statusCode: response.status,
            response: JSON.stringify({
              status: response.status,
              headers: response.headers,
              data: response.data
            }).slice(0, 1000), // Limituj veľkosť odpovede
            success: response.status >= 200 && response.status < 300
          }
        });

        return true;
      } catch (error) {
        // Ulož neúspešnú delivery
        const axiosError = error as AxiosError;

        await prisma.webhookDelivery.create({
          data: {
            webhookId,
            event: payload.event,
            payload,
            statusCode: axiosError.response?.status || 0,
            response: JSON.stringify({
              error: axiosError.message,
              response: axiosError.response ? {
                status: axiosError.response.status,
                data: axiosError.response.data
              } : null
            }).slice(0, 1000),
            success: false
          }
        });
        throw error; // Re-throw pre Bull retry mechanizmus
      }
    });

    // Konfiguruj retry a čistenie
    webhookQueue.on('failed', async (job, err) => {
      console.error(`Webhook delivery zlyhala (pokus ${job.attemptsMade})`, err);

      if (job.attemptsMade >= 5) {
        console.error('Webhook delivery bola zahodená po 5 pokusoch', {
          webhookId: job.data.webhookId,
          event: job.data.payload.event
        });
      }
    });
  }
}

// Export singleton inštancie
export const webhookService = new WebhookService();

// Inicializuj processor ak sú webhooky povolené
if (config.features.webhooks) {
  WebhookService.initializeProcessor();
}
