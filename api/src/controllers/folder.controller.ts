import { Context } from 'hono';
import { folderService } from '../services/folder.service';
import {
  createFolderSchema,
  folderPathParamSchema,
  listFoldersQuerySchema
} from '../validators/folder.validator';

/**
 * Kontrolér pre prácu s adresármi
 */
export class FolderController {
  /**
   * Vytvorí nový adresár
   */
  async createFolder(c: Context): Promise<Response> {
    // Validuj telo požiadavky
    const body = createFolderSchema.parse(await c.req.json());

    // Vytvor adresár
    const folder = await folderService.createFolder(body.path, body.description);

    return c.json({
      message: 'Adresár bol úspešne vytvorený',
      folder
    }, 201);
  }

  /**
   * Vymaže adresár
   */
  async deleteFolder(c: Context): Promise<Response> {
    // Validuj parametre
    const params = folderPathParamSchema.parse(c.req.param());

    // Získaj query parametre
    const force = c.req.query('force') === 'true';

    // Vymaž adresár
    await folderService.deleteFolder(params.path, force);

    return c.json({
      message: `Adresár ${params.path} bol úspešne vymazaný`
    });
  }

  /**
   * Získa zoznam adresárov
   */
  async listFolders(c: Context): Promise<Response> {
    // Validuj query parametre
    const query = listFoldersQuerySchema.parse(c.req.query());

    // Získaj zoznam adresárov
    const folders = await folderService.listFolders(query.path, query.recursive);

    return c.json({
      folders,
      count: folders.length
    });
  }
}

// Export singleton inštancie
export const folderController = new FolderController();
