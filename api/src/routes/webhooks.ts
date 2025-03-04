import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { webhookService, WebhookEventType } from '../services/webhook.service';
import { authenticate, authorize } from '../middlewares/auth.middleware';

// Schéma pre vytvorenie webhoku
const createWebhookSchema = z.object({
  name: z.string().min(1, 'Názov webhoku je povinný').max(100),
  url: z.string().url('Neplatná URL adresa'),
  secret: z.string().optional(),
  events: z.array(z.nativeEnum(WebhookEventType)).min(1, 'Aspoň jedna udalosť musí byť vybraná')
});

// Schéma pre aktualizáciu webhoku
const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url('Neplatná URL adresa').optional(),
  secret: z.string().optional(),
  active: z.boolean().optional(),
  events: z.array(z.nativeEnum(WebhookEventType)).min(1).optional()
});

// Schéma pre parametre
const webhookParamSchema = z.object({
  id: z.string().uuid('Neplatné ID webhoku')
});

// Vytvor router pre webhooky
const router = new Hono();

// Middleware pre autentifikáciu - všetky endpointy vyžadujú prihlásenie
router.use('*', authenticate);

// Vytvor nový webhook
router.post('/', authorize(['ADMIN', 'MANAGER']), zValidator('json', createWebhookSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');

  const webhook = await webhookService.createWebhook(
    data.name,
    data.url,
    data.events,
    user.sub,
    data.secret
  );

  return c.json({
    message: 'Webhook bol úspešne vytvorený',
    webhook
  }, 201);
});

// Aktualizuj webhook
router.put('/:id', authorize(['ADMIN', 'MANAGER']), zValidator('param', webhookParamSchema), zValidator('json', updateWebhookSchema), async (c) => {
  const { id } = c.req.valid('param');
  const data = c.req.valid('json');
  const user = c.get('user');

  const webhook = await webhookService.updateWebhook(id, data, user.sub);

  return c.json({
    message: 'Webhook bol úspešne aktualizovaný',
    webhook
  });
});

// Vymaž webhook
router.delete('/:id', authorize(['ADMIN', 'MANAGER']), zValidator('param', webhookParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const user = c.get('user');

  await webhookService.deleteWebhook(id, user.sub);

  return c.json({
    message: 'Webhook bol úspešne vymazaný'
  });
});

// Získaj webhook podľa ID
router.get('/:id', zValidator('param', webhookParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const user = c.get('user');

  const webhook = await webhookService.getWebhook(id, user.sub);

  return c.json(webhook);
});

// Získaj zoznam webhookov
router.get('/', async (c) => {
  const user = c.get('user');

  const webhooks = await webhookService.listWebhooks(user.sub);

  return c.json({
    webhooks,
    count: webhooks.length
  });
});

export { router as webhookRouter };
