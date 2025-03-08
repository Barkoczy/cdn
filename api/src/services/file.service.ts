import * as fsPromises from 'node:fs/promises';
import * as fs from 'node:fs';
import path from 'node:path';
import mime from 'mime-types';
import { Transform } from 'stream';
import { constants } from 'node:fs';
import { nanoid } from 'nanoid';
import { config } from '../config';
import { AppError } from '../middlewares/error-handler';
import type { FileMetadata, ChunkUploadSession, FileListResult } from '../types';

// Upraviť global deklaráciu aby TypeScript nehlásil chybu
declare global {
  // eslint-disable-next-line no-var
  var chunkUploadSessions: Map<string, ChunkUploadSession> | undefined;
}

/**
 * Service pre prácu so súbormi
 */
export class FileService {
  private basePath: string;

  constructor() {
    this.basePath = config.storagePath;
  }

  /**
   * Kontroluje a vytvorí adresár ak neexistuje
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, dirPath);
      await fsPromises.mkdir(fullPath, { recursive: true });
    } catch (error) {
      throw new AppError(`Nepodarilo sa vytvoriť adresár: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Kontroluje či súbor existuje
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await fsPromises.access(fullPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Uloží súbor na disk
   */
  async saveFile(
    fileBuffer: Buffer,
    fileName: string,
    filePath: string,
    mimeType: string,
    userId: string,
    metadata?: Partial<FileMetadata>
  ): Promise<FileMetadata> {
    // Vytvor cieľový adresár ak neexistuje
    await this.ensureDirectoryExists(filePath);

    // Vytvor unikátny názov súboru ak už existuje
    let finalFileName = fileName;
    const fileExt = path.extname(fileName);
    const fileNameWithoutExt = path.basename(fileName, fileExt);

    if (await this.fileExists(path.join(filePath, finalFileName))) {
      finalFileName = `${fileNameWithoutExt}-${nanoid(6)}${fileExt}`;
    }

    try {
      // Ulož súbor
      await new Promise<void>((resolve, reject) => {
        fs.writeFile(path.join(this.basePath, filePath, finalFileName), fileBuffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Vytvor metadáta
      const now = new Date().toISOString();
      const fileInfo = await fsPromises.stat(path.join(this.basePath, filePath, finalFileName));

      const fileMetadata: FileMetadata = {
        name: finalFileName,
        path: filePath ? `${filePath}/${finalFileName}` : finalFileName,
        size: fileInfo.size,
        mimeType: mimeType,
        createdAt: now,
        updatedAt: now,
        userId,
        ...metadata
      };

      return fileMetadata;
    } catch (error) {
      throw new AppError(`Nepodarilo sa uložiť súbor: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Získa metadáta súboru a spracuje Range header
   */
  async getFileMetadataAndRange(filePath: string, range?: string): Promise<{
    metadata: FileMetadata;
    rangeInfo?: { start: number; end: number; length: number; contentLength: number }
  }> {
    try {
      const fullPath = path.join(this.basePath, filePath);

      // Skontroluj či súbor existuje
      const exists = await this.fileExists(filePath);
      if (!exists) {
        throw new AppError(`Súbor ${filePath} nebol nájdený`, 404);
      }

      // Zisti informácie o súbore
      const stats = await fsPromises.stat(fullPath);
      const fileName = path.basename(filePath);
      const mimeType = mime.lookup(filePath) || 'application/octet-stream';
      const metadata: FileMetadata = {
        name: fileName,
        path: filePath,
        size: stats.size,
        mimeType,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString()
      };

      // Spracuj Range header ak existuje
      let rangeInfo;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

        // Validácia rozsahu
        if (start >= stats.size || end >= stats.size) {
          throw new AppError('Požadovaný rozsah nie je dostupný', 416);
        }

        const contentLength = end - start + 1;
        rangeInfo = { start, end, length: stats.size, contentLength };
      }

      return { metadata, rangeInfo };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa získať informácie o súbore: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Vytvorí stream súboru s možnosťou throttlingu
   */
  async createFileStream(filePath: string, startByte?: number, endByte?: number): Promise<fs.ReadStream | Transform> {
    try {
      const fullPath = path.join(this.basePath, filePath);

      // Priprav options pre createReadStream
      let readOptions: { start?: number; end?: number } = {};
      if (startByte !== undefined && endByte !== undefined) {
        readOptions = { start: startByte, end: endByte };
      }

      // Vytvor základný stream
      const fileStream = fs.createReadStream(fullPath, readOptions);

      return fileStream;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa vytvoriť stream súboru: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Vymaže súbor
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, filePath);

      // Skontroluj či súbor existuje
      const exists = await this.fileExists(filePath);
      if (!exists) {
        throw new AppError(`Súbor ${filePath} nebol nájdený`, 404);
      }

      // Vymaž súbor
      await new Promise<void>((resolve, reject) => {
        fs.unlink(fullPath, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa vymazať súbor: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Získa zoznam súborov v adresári
   */
  async listFiles(dirPath: string, recursive: boolean = false, page: number = 1, limit: number = 50): Promise<FileListResult> {
    try {
      const fullPath = path.join(this.basePath, dirPath);

      // Skontroluj či adresár existuje
      try {
        await fsPromises.access(fullPath, constants.F_OK);
      } catch {
        // Ak adresár neexistuje, vráť prázdny zoznam
        return {
          items: [],
          totalItems: 0,
          page,
          limit
        };
      }

      // Načítaj súbory v adresári
      const files = await this.readDirRecursive(fullPath, recursive, dirPath);

      // Aplikuj stránkovanie
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedFiles = files.slice(startIndex, endIndex);

      return {
        items: paginatedFiles,
        totalItems: files.length,
        page,
        limit
      };
    } catch (error) {
      throw new AppError(`Nepodarilo sa načítať zoznam súborov: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Rekurzívne číta adresár a vráti zoznam súborov
   */
  private async readDirRecursive(dir: string, recursive: boolean, basePath: string = ''): Promise<FileMetadata[]> {
    const dirents = await fsPromises.readdir(dir, { withFileTypes: true });
    const files: FileMetadata[] = [];

    for (const dirent of dirents) {
      const res = path.join(dir, dirent.name);
      const relativePath = path.join(basePath, dirent.name);

      if (dirent.isDirectory() && recursive) {
        // Ak je to adresár a je zapnutá rekurzia, čítaj rekurzívne
        const nestedFiles = await this.readDirRecursive(res, recursive, relativePath);
        files.push(...nestedFiles);
      } else if (!dirent.isDirectory()) {
        // Ak je to súbor, pridaj do zoznamu
        const stats = await fsPromises.stat(res);
        const mimeType = mime.lookup(dirent.name) || 'application/octet-stream';

        files.push({
          name: dirent.name,
          path: relativePath,
          size: stats.size,
          mimeType,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString()
        });
      }
    }

    return files;
  }

  /**
   * Inicializuje postupné nahrávanie (chunked upload)
   */
  async initChunkedUpload(
    fileName: string,
    fileSize: number,
    mimeType: string,
    filePath: string,
    userId: string,
    totalChunks: number,
    metadata?: FileMetadata
  ): Promise<ChunkUploadSession> {
  // Vytvorenie jedinečného ID pre upload session
    const sessionId = nanoid(16);

    // Vytvorenie dočasného adresára pre chunky
    const tempDir = path.join(this.basePath, '.tmp', sessionId);
    await this.ensureDirectoryExists(`.tmp/${sessionId}`);

    // Vytvorenie session
    const session: ChunkUploadSession = {
      id: sessionId,
      userId,
      fileName,
      fileSize,
      mimeType,
      filePath,
      tempDir, // Uložiť tempDir do session
      metadata,
      chunksReceived: 0,
      totalChunks,
      createdAt: new Date().toISOString()
    };

    // V produkcii by sa táto informácia uložila do Redis alebo DB
    // Pre jednoduchosť použijeme globálnu premennú
    if (!global.chunkUploadSessions) {
      global.chunkUploadSessions = new Map<string, ChunkUploadSession>();
    }

    global.chunkUploadSessions.set(sessionId, session);

    return session;
  }

  /**
   * Spracuje chunk súboru v rámci postupného nahrávania
   */
  async uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunkBuffer: Buffer
  ): Promise<{ chunksReceived: number, totalChunks: number }> {
  // Získanie session
    if (!global.chunkUploadSessions) {
      throw new AppError('Upload sessions not initialized', 500);
    }

    const session = global.chunkUploadSessions.get(sessionId);

    if (!session) {
      throw new AppError('Upload session not found or expired', 404);
    }

    // Uloženie chunku do dočasného súboru
    const chunkPath = path.join(this.basePath, '.tmp', sessionId, `chunk-${chunkIndex}`);
    await fsPromises.writeFile(chunkPath, chunkBuffer);

    // Aktualizácia session
    session.chunksReceived++;
    global.chunkUploadSessions.set(sessionId, session);

    return {
      chunksReceived: session.chunksReceived,
      totalChunks: session.totalChunks
    };
  }

  /**
   * Dokončí postupné nahrávanie a spojí chunky do finálneho súboru
   */
  async finalizeChunkedUpload(sessionId: string): Promise<FileMetadata> {
  // Získanie session
    if (!global.chunkUploadSessions) {
      throw new AppError('Upload sessions not initialized', 500);
    }

    const session = global.chunkUploadSessions.get(sessionId);

    if (!session) {
      throw new AppError('Upload session not found or expired', 404);
    }

    // Kontrola, či boli prijaté všetky chunky
    if (session.chunksReceived !== session.totalChunks) {
      throw new AppError(`Incomplete upload: received ${session.chunksReceived} of ${session.totalChunks} chunks`, 400);
    }

    try {
    // Vytvorenie cieľového adresára
      await this.ensureDirectoryExists(session.filePath);

      // Vytvorenie cieľového súboru pomocou fs (nie fs/promises)
      const finalFilePath = path.join(this.basePath, session.filePath, session.fileName);
      const writeStream = fs.createWriteStream(finalFilePath);

      // Spojenie všetkých chunkov do jedného súboru
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = path.join(this.basePath, '.tmp', sessionId, `chunk-${i}`);
        const chunkData = await fsPromises.readFile(chunkPath);

        // Použitie promise pre zápis stream
        await new Promise<void>((resolve, reject) => {
          writeStream.write(chunkData, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Vymazanie chunku po spracovaní
        await fsPromises.unlink(chunkPath);
      }

      // Zatvorenie writeStream
      await new Promise<void>((resolve, reject) => {
        writeStream.end((err: Error | null | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Zistenie finálnych informácií o súbore
      const stats = await fsPromises.stat(finalFilePath);

      const fileMetadata: FileMetadata = {
        name: session.fileName,
        path: session.filePath ? `${session.filePath}/${session.fileName}` : session.fileName,
        size: stats.size,
        mimeType: session.mimeType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: session.userId,
        ...(session.metadata || {})
      };

      // Vymazanie dočasného adresára
      await fsPromises.rm(path.join(this.basePath, '.tmp', sessionId), { recursive: true, force: true });

      // Odstránenie session
      global.chunkUploadSessions.delete(sessionId);

      return fileMetadata;
    } catch (error) {
      throw new AppError(`Failed to finalize upload: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }
}

// Export singleton inštancie
export const fileService = new FileService();
