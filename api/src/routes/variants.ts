import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { imageProcessingService, VariantPreset, predefinedVariants } from '../services/image-processing.service';
import { authenticate } from '../middlewares/auth.middleware';

// Schéma pre parametre súboru
const fileParamSchema = z.object({
  fileId: z.string().uuid('Neplatné ID súboru')
});

// Schéma pre parametre variantu
const variantParamSchema = z.object({
  fileId: z.string().uuid('Neplatné ID súboru'),
  preset: z.enum(Object.keys(predefinedVariants) as [VariantPreset, ...VariantPreset[]])
});

// Schéma pre vytvorenie vlastného variantu
const createCustomVariantSchema = z.object({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  format: z.enum(['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif']).optional(),
  quality: z.number().int().min(1).max(100).optional(),
  crop: z.boolean().optional(),
  grayscale: z.boolean().optional(),
  blur: z.number().min(0.3).max(1000).optional(),
  rotate: z.number().min(-360).max(360).optional()
}).refine(data => data.width !== undefined || data.height !== undefined, {
  message: 'Aspoň jedna hodnota (width alebo height) musí byť zadaná'
});

// Vytvor router pre varianty obrázkov
const router = new Hono();

// Middleware pre autentifikáciu - všetky endpointy vyžadujú prihlásenie
router.use('*', authenticate);

// Získaj zoznam variantov obrázka
router.get('/file/:fileId', zValidator('param', fileParamSchema), async (c) => {
  const { fileId } = c.req.valid('param');

  const variants = await imageProcessingService.getVariants(fileId);

  return c.json({
    variants,
    count: variants.length,
    presets: Object.keys(predefinedVariants)
  });
});

// Získaj preddefinovaný variant obrázka
router.get('/file/:fileId/:preset', zValidator('param', variantParamSchema), async (c) => {
  const { fileId, preset } = c.req.valid('param');

  const { buffer, variant } = await imageProcessingService.getPresetVariant(fileId, preset);

  // Urči správny content-type podľa formátu
  let contentType = 'image/jpeg';
  switch (variant.format) {
  case 'jpeg':
  case 'jpg':
    contentType = 'image/jpeg';
    break;
  case 'png':
    contentType = 'image/png';
    break;
  case 'webp':
    contentType = 'image/webp';
    break;
  case 'avif':
    contentType = 'image/avif';
    break;
  case 'tiff':
    contentType = 'image/tiff';
    break;
  case 'gif':
    contentType = 'image/gif';
    break;
  }

  // Vráť buffer obrázka
  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': variant.size.toString(),
      'Cache-Control': 'public, max-age=31536000' // 1 rok
    }
  });
});

// Vytvor vlastný variant obrázka
router.post('/file/:fileId/custom', zValidator('param', fileParamSchema), zValidator('json', createCustomVariantSchema), async (c) => {
  const { fileId } = c.req.valid('param');
  const options = c.req.valid('json');

  const { buffer, variant } = await imageProcessingService.createCustomVariant(fileId, options);

  // Urči správny content-type podľa formátu
  let contentType = 'image/jpeg';
  switch (variant.format) {
  case 'jpeg':
  case 'jpg':
    contentType = 'image/jpeg';
    break;
  case 'png':
    contentType = 'image/png';
    break;
  case 'webp':
    contentType = 'image/webp';
    break;
  case 'avif':
    contentType = 'image/avif';
    break;
  case 'tiff':
    contentType = 'image/tiff';
    break;
  case 'gif':
    contentType = 'image/gif';
    break;
  }

  // Vráť buffer obrázka
  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': variant.size.toString(),
      'X-Variant-Id': variant.id
    }
  });
});

// Vymaž všetky varianty obrázka
router.delete('/file/:fileId', zValidator('param', fileParamSchema), async (c) => {
  const { fileId } = c.req.valid('param');

  await imageProcessingService.deleteAllVariants(fileId);

  return c.json({
    message: 'Všetky varianty obrázka boli úspešne vymazané'
  });
});

export { router as variantRouter };
