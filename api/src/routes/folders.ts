import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { folderController } from '../controllers/folder.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  createFolderSchema,
  folderPathParamSchema,
  listFoldersQuerySchema
} from '../validators/folder.validator';

// Vytvor router pre adresáre
const router = new Hono();

// Middleware pre autentifikáciu - všetky endpointy vyžadujú prihlásenie
router.use('*', authenticate);

// Vytvor nový adresár - len admin môže vytvárať adresáre
router.post('/', authorize(['admin']), zValidator('json', createFolderSchema), folderController.createFolder);

// Vymaž adresár - len admin môže mazať adresáre
router.delete('/:path{.*}', authorize(['admin']), zValidator('param', folderPathParamSchema), folderController.deleteFolder);

// Zoznam adresárov - autentifikovaný používateľ
router.get('/', zValidator('query', listFoldersQuerySchema), folderController.listFolders);

export { router as foldersRouter };
