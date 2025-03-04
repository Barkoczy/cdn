import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { nanoid } from 'nanoid';
import { config } from '../config';
import { AppError } from '../middlewares/error-handler';
import mime from 'mime-types';

// Rozhranie pre metadáta súboru
export interface FileMetadata {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  expiresAt?: string;
  userId?: string;
}

// Rozhranie pre výsledok listu súborov
export interface FileListResult {
  items: FileMetadata[];
  totalItems: number;
  page: number;
  limit: number;
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
      await fs.mkdir(fullPath, { recursive: true });
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
      await fs.access(fullPath, constants.F_OK);
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
      await fs.writeFile(path.join(this.basePath, filePath, finalFileName), fileBuffer);

      // Vytvor metadáta
      const now = new Date().toISOString();
      const fileInfo = await fs.stat(path.join(this.basePath, filePath, finalFileName));

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
   * Prečíta a vráti súbor
   */
  async getFile(filePath: string): Promise<{ buffer: Buffer; metadata: FileMetadata }> {
    try {
      const fullPath = path.join(this.basePath, filePath);

      // Skontroluj či súbor existuje
      const exists = await this.fileExists(filePath);
      if (!exists) {
        throw new AppError(`Súbor ${filePath} nebol nájdený`, 404);
      }

      // Načítaj súbor
      const buffer = await fs.readFile(fullPath);

      // Zisti informácie o súbore
      const stats = await fs.stat(fullPath);
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

      return { buffer, metadata };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa načítať súbor: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
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
      await fs.unlink(fullPath);
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
        await fs.access(fullPath, constants.F_OK);
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
    const dirents = await fs.readdir(dir, { withFileTypes: true });
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
        const stats = await fs.stat(res);
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
}

// Export singleton inštancie
export const fileService = new FileService();
