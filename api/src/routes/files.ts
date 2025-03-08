import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { zValidator } from '@hono/zod-validator';
import { fileController } from '../controllers/file.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { pathParamSchema, listFilesQuerySchema } from '../validators/file.validator';
import { config } from '../config';

// Vytvor router pre súbory
const router = new Hono();

// Middleware pre autentifikáciu - všetky endpointy vyžadujú prihlásenie
router.use('*', authenticate);

// Upload súboru - len admin môže nahrávať súbory
router.post('/',
  bodyLimit({
    maxSize: config.maxFileSize, // Použiť hodnotu z konfigurácie
    onError: (c) => {
      const sizeInGB = (config.maxFileSize / (1024 * 1024 * 1024)).toFixed(2);
      return c.json({
        error: `Súbor je príliš veľký. Maximálna povolená veľkosť je ${sizeInGB}GB`,
        maxAllowedSize: config.maxFileSize
      }, 413);
    },
  }),
  authorize(['admin']),
  fileController.uploadFile
);

// Získaj súbor podľa cesty - autentifikovaný používateľ
router.get('/:path{.*}', zValidator('param', pathParamSchema), fileController.getFile);

// Vymaž súbor - len admin môže mazať súbory
router.delete('/:path{.*}', authorize(['admin']), zValidator('param', pathParamSchema), fileController.deleteFile);

// Zoznam súborov - autentifikovaný používateľ
router.get('/', zValidator('query', listFilesQuerySchema), fileController.listFiles);

export { router as filesRouter };
