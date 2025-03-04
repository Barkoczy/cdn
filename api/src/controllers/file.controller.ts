import { Context } from 'hono';
import { fileService } from '../services/file.service';
import { folderService } from '../services/folder.service';
import { validateFileSize, validateMimeType } from '../validators/file.validator';
import { AppError } from '../middlewares/error-handler';
import {
  pathParamSchema,
  uploadFileSchema,
  listFilesQuerySchema
} from '../validators/file.validator';
import { UserPayload } from '../types';
import mime from 'mime-types';

/**
 * Kontrolér pre prácu so súbormi
 */
export class FileController {
  /**
   * Nahrá súbor
   */
  async uploadFile(c: Context): Promise<Response> {
    // Parsuj form data
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new AppError('Súbor nebol poskytnutý', 400);
    }

    // Získaj a validuj metadáta z form data
    const metadataJson = formData.get('metadata') as string | null;
    const filename = formData.get('filename') as string || file.name;
    const filePath = formData.get('path') as string || '';

    // Validuj metadáta cez Zod
    const validatedData = uploadFileSchema.parse({
      filename,
      path: filePath,
      metadata: metadataJson ? JSON.parse(metadataJson) : undefined
    });

    // Validuj MIME typ súboru
    const mimeType = file.type || mime.lookup(filename) || 'application/octet-stream';
    if (!validateMimeType(mimeType)) {
      throw new AppError(`MIME typ ${mimeType} nie je povolený`, 400);
    }

    // Validuj veľkosť súboru
    if (!validateFileSize(file.size)) {
      throw new AppError(`Súbor je príliš veľký. Maximálna povolená veľkosť je ${Math.floor(file.size / (1024 * 1024))}MB`, 400);
    }

    // Skontroluj či cieľový adresár existuje
    if (validatedData.path && !(await folderService.folderExists(validatedData.path))) {
      await folderService.createFolder(validatedData.path);
    }

    // Konvertuj File na Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Získaj informácie o používateľovi
    const user = c.get('user') as UserPayload;

    // Ulož súbor
    const savedFile = await fileService.saveFile(
      buffer,
      validatedData.filename,
      validatedData.path,
      mimeType,
      user.sub,
      validatedData.metadata
    );

    return c.json({
      message: 'Súbor bol úspešne nahraný',
      file: savedFile
    }, 201);
  }

  /**
   * Získa súbor podľa cesty
   */
  async getFile(c: Context): Promise<Response> {
    const params = pathParamSchema.parse(c.req.param());

    // Získaj súbor
    const { buffer, metadata } = await fileService.getFile(params.path);

    // Nastav headers
    return new Response(buffer, {
      headers: {
        'Content-Type': metadata.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(metadata.name)}"`,
        'Content-Length': metadata.size.toString(),
        'Cache-Control': 'public, max-age=31536000', // 1 rok
        'Last-Modified': new Date(metadata.updatedAt).toUTCString()
      }
    });
  }

  /**
   * Vymaže súbor
   */
  async deleteFile(c: Context): Promise<Response> {
    const params = pathParamSchema.parse(c.req.param());

    // Vymaž súbor
    await fileService.deleteFile(params.path);

    return c.json({
      message: `Súbor ${params.path} bol úspešne vymazaný`
    }, 200);
  }

  /**
   * Získa zoznam súborov
   */
  async listFiles(c: Context): Promise<Response> {
    const query = listFilesQuerySchema.parse(c.req.query());

    // Získaj zoznam súborov
    const files = await fileService.listFiles(
      query.path,
      query.recursive,
      query.page,
      query.limit
    );

    return c.json(files);
  }
}

// Export singleton inštancie
export const fileController = new FileController();
