import { Context } from 'hono';
import { fileService } from '../services/file.service';
import { folderService } from '../services/folder.service';
import { AppError } from '../middlewares/error-handler';
import { validateFileSize, validateMimeType } from '../validators/file.validator';
import { UserPayload } from '../types';

export class ChunkedFileController {
  /**
   * Inicializuje postupné nahrávanie
   */
  async initUpload(c: Context): Promise<Response> {
    const data = await c.req.json();
    const user = c.get('user') as UserPayload;

    const { fileName, fileSize, mimeType, path, totalChunks, metadata } = data;

    // Validácia vstupov
    if (!fileName || !fileSize || !mimeType || !totalChunks) {
      throw new AppError('Chýbajú povinné parametre', 400);
    }

    // Validácia MIME typu
    if (!validateMimeType(mimeType)) {
      throw new AppError(`MIME typ ${mimeType} nie je povolený`, 400);
    }

    // Validácia veľkosti súboru
    if (!validateFileSize(fileSize)) {
      throw new AppError('Súbor je príliš veľký. Maximálna povolená veľkosť je 10GB', 400);
    }

    // Skontroluj či cieľový adresár existuje
    if (path && !(await folderService.folderExists(path))) {
      await folderService.createFolder(path);
    }

    // Inicializácia upload session
    const session = await fileService.initChunkedUpload(
      fileName,
      fileSize,
      mimeType,
      path || '',
      user.sub,
      totalChunks,
      metadata
    );

    return c.json({
      uploadId: session.id,
      chunksReceived: 0,
      totalChunks: session.totalChunks
    });
  }

  /**
   * Spracuje chunk súboru
   */
  async uploadChunk(c: Context): Promise<Response> {
    const uploadId = c.req.param('id');
    const chunkIndex = parseInt(c.req.query('chunk') || '0');

    // Validácia vstupov
    if (isNaN(chunkIndex) || chunkIndex < 0) {
      throw new AppError('Neplatný index chunku', 400);
    }

    // Získanie dát chunku
    const formData = await c.req.formData();
    const chunkFile = formData.get('chunk') as File | null;

    if (!chunkFile) {
      throw new AppError('Chunk nebol poskytnutý', 400);
    }

    // Konverzia File na Buffer
    const arrayBuffer = await chunkFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Spracovanie chunku
    const result = await fileService.uploadChunk(uploadId, chunkIndex, buffer);

    return c.json({
      uploadId,
      chunksReceived: result.chunksReceived,
      totalChunks: result.totalChunks,
      progress: Math.round((result.chunksReceived / result.totalChunks) * 100)
    });
  }

  /**
   * Dokončí postupné nahrávanie
   */
  async finalizeUpload(c: Context): Promise<Response> {
    const uploadId = c.req.param('id');

    // Dokončenie nahrávania
    const fileMetadata = await fileService.finalizeChunkedUpload(uploadId);

    return c.json({
      message: 'Súbor bol úspešne nahraný',
      file: fileMetadata
    }, 201);
  }
}

export const chunkedFileController = new ChunkedFileController();
