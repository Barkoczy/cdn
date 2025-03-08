import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { chunkedFileController } from '../controllers/chunked-file.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

// Vytvor router pre chunked files
const router = new Hono();

// Middleware pre autentifikáciu
router.use('*', authenticate);

// Inicializácia postupného nahrávania - len admin
router.post('/init',
  authorize(['admin']),
  chunkedFileController.initUpload
);

// Upload chunku - len admin, s menším limitom pre jeden chunk
router.post('/:id/chunk',
  bodyLimit({
    maxSize: 10 * 1024 * 1024, // 10MB limit na jeden chunk
    onError: (c) => {
      return c.json({
        error: 'Chunk je príliš veľký. Maximálna povolená veľkosť je 10MB',
        maxAllowedSize: 10 * 1024 * 1024
      }, 413);
    },
  }),
  authorize(['admin']),
  chunkedFileController.uploadChunk
);

// Dokončenie postupného nahrávania - len admin
router.post('/:id/finalize',
  authorize(['admin']),
  chunkedFileController.finalizeUpload
);

export { router as chunkedFilesRouter };
