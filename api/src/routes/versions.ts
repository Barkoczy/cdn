import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { versioningService } from '../services/versioning.service';
import { authenticate, authorize } from '../middlewares/auth.middleware';

// Schéma pre parametre súboru
const fileParamSchema = z.object({
  fileId: z.string().uuid('Neplatné ID súboru')
});

// Schéma pre parametre verzie
const versionParamSchema = z.object({
  fileId: z.string().uuid('Neplatné ID súboru'),
  versionNumber: z.string().regex(/^\d+$/).transform(Number)
});

// Schéma pre porovnanie verzií
const compareVersionsSchema = z.object({
  versionA: z.number().int().positive(),
  versionB: z.number().int().positive()
});

// Vytvor router pre verzie
const router = new Hono();

// Middleware pre autentifikáciu - všetky endpointy vyžadujú prihlásenie
router.use('*', authenticate);

// Získaj zoznam verzií súboru
router.get('/file/:fileId', zValidator('param', fileParamSchema), async (c) => {
  const { fileId } = c.req.valid('param');

  const versions = await versioningService.getVersions(fileId);

  return c.json({
    versions,
    count: versions.length
  });
});

// Získaj konkrétnu verziu súboru
router.get('/file/:fileId/:versionNumber', zValidator('param', versionParamSchema), async (c) => {
  const { fileId, versionNumber } = c.req.valid('param');

  const fileBuffer = await versioningService.getVersion(fileId, versionNumber);

  // Získaj metadáta o verzii
  const versions = await versioningService.getVersions(fileId);
  const version = versions.find(v => v.versionNumber === versionNumber);

  if (!version) {
    return c.json({ error: 'Verzia nebola nájdená' }, 404);
  }

  // Vráť buffer súboru
  return new Response(fileBuffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="version-${versionNumber}"`,
      'Content-Length': version.size.toString()
    }
  });
});

// Obnovenie súboru na konkrétnu verziu
router.post('/file/:fileId/:versionNumber/restore', authorize(['ADMIN', 'MANAGER']), zValidator('param', versionParamSchema), async (c) => {
  const { fileId, versionNumber } = c.req.valid('param');
  const user = c.get('user');

  await versioningService.restoreVersion(fileId, versionNumber, user.sub);

  return c.json({
    message: `Súbor bol úspešne obnovený na verziu ${versionNumber}`
  });
});

// Vymazanie konkrétnej verzie
router.delete('/file/:fileId/:versionNumber', authorize(['ADMIN']), zValidator('param', versionParamSchema), async (c) => {
  const { fileId, versionNumber } = c.req.valid('param');
  const user = c.get('user');

  await versioningService.deleteVersion(fileId, versionNumber, user.sub);

  return c.json({
    message: `Verzia ${versionNumber} bola úspešne vymazaná`
  });
});

// Vymazanie všetkých verzií
router.delete('/file/:fileId', authorize(['ADMIN']), zValidator('param', fileParamSchema), async (c) => {
  const { fileId } = c.req.valid('param');
  const user = c.get('user');

  await versioningService.deleteAllVersions(fileId, user.sub);

  return c.json({
    message: 'Všetky verzie boli úspešne vymazané'
  });
});

// Porovnanie dvoch verzií
router.post('/file/:fileId/compare', zValidator('param', fileParamSchema), zValidator('json', compareVersionsSchema), async (c) => {
  const { fileId } = c.req.valid('param');
  const { versionA, versionB } = c.req.valid('json');

  const comparison = await versioningService.compareVersions(fileId, versionA, versionB);

  return c.json(comparison);
});

export { router as versionRouter };
