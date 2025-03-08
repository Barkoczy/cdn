import { ContentfulStatusCode } from 'hono/utils/http-status';
import { Context } from 'hono';
import mime from 'mime-types';
import { fileService } from '../services/file.service';
import { folderService } from '../services/folder.service';
import { AppError } from '../middlewares/error-handler';
import {
  pathParamSchema,
  uploadFileSchema,
  listFilesQuerySchema,
  validateFileSize,
  validateMimeType
} from '../validators/file.validator';
import type { UserPayload } from '../types';

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

    // Validuj veľkosť súboru
    if (!validateFileSize(file.size)) {
      throw new AppError('Súbor je príliš veľký. Maximálna povolená veľkosť je 10GB', 400);
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
   * Získa súbor podľa cesty s možnosťou obmedzenia rýchlosti
   */
  async getFile(c: Context): Promise<Response> {
    const params = pathParamSchema.parse(c.req.param());
    const rangeHeader = c.req.header('Range');

    try {
      // Najskôr získame iba metadáta súboru
      const { metadata, rangeInfo } = await fileService.getFileMetadataAndRange(
        params.path,
        rangeHeader
      );

      // Základné hlavičky
      const headers = {
        'Content-Type': metadata.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(metadata.name)}"`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date(metadata.updatedAt).toUTCString()
      };

      // Vytvorenie ReadableStream pre Response
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            // Až tu vytvoríme stream - po odoslaní hlavičiek
            const stream = await fileService.createFileStream(
              params.path,
              rangeInfo?.start,
              rangeInfo?.end
            );

            // Napojíme eventy
            stream.on('data', (chunk: Buffer) => {
              controller.enqueue(chunk);
            });

            stream.on('end', () => {
              controller.close();
            });

            stream.on('error', (err: Error) => {
              console.error('Stream error:', err);
              controller.error(err);
            });
          } catch (error) {
            console.error('Error creating stream:', error);
            controller.error(error);
          }
        },
        cancel() {
          // Client canceled download
        }
      });

      // Vráť Response s hlavičkami a ReadableStream
      if (rangeInfo) {
        return new Response(readableStream, {
          status: 206,
          headers: {
            ...headers,
            'Content-Range': `bytes ${rangeInfo.start}-${rangeInfo.end}/${rangeInfo.length}`,
            'Content-Length': String(rangeInfo.contentLength)
          }
        });
      }

      // Inak vráť celý súbor
      return new Response(readableStream, {
        headers: {
          ...headers,
          'Content-Length': String(metadata.size)
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        return c.json({ error: error.message }, error.statusCode as ContentfulStatusCode);
      }
      return c.json({ error: 'Nepodarilo sa načítať súbor' }, 500);
    }
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
