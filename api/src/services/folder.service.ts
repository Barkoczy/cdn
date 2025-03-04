import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { config } from '../config';
import { AppError } from '../middlewares/error-handler';

// Rozhranie pre adresár
export interface FolderInfo {
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  isDirectory: true;
  description?: string;
}

/**
 * Service pre prácu s adresármi
 */
export class FolderService {
  private basePath: string;

  constructor() {
    this.basePath = config.storagePath;
  }

  /**
   * Vytvorí nový adresár
   */
  async createFolder(folderPath: string, description?: string): Promise<FolderInfo> {
    try {
      const fullPath = path.join(this.basePath, folderPath);

      // Skontroluj či adresár už existuje
      try {
        await fs.access(fullPath, constants.F_OK);
        throw new AppError(`Adresár ${folderPath} už existuje`, 400);
      } catch (error) {
        // Ak adresár neexistuje, môžeme pokračovať
        if (!(error instanceof AppError)) {
          // OK, adresár neexistuje
        } else {
          throw error;
        }
      }

      // Vytvor adresár
      await fs.mkdir(fullPath, { recursive: true });

      // Zisti informácie o adresári
      const stats = await fs.stat(fullPath);
      const folderName = path.basename(folderPath);

      return {
        name: folderName,
        path: folderPath,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
        isDirectory: true,
        description
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa vytvoriť adresár: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Vymaže adresár
   */
  async deleteFolder(folderPath: string, force: boolean = false): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, folderPath);

      // Skontroluj či adresár existuje
      try {
        await fs.access(fullPath, constants.F_OK);
      } catch {
        throw new AppError(`Adresár ${folderPath} nebol nájdený`, 404);
      }

      // Skontroluj či je to adresár
      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) {
        throw new AppError(`Cesta ${folderPath} nie je adresár`, 400);
      }

      // Skontroluj či je adresár prázdny, ak nie je force
      if (!force) {
        const files = await fs.readdir(fullPath);
        if (files.length > 0) {
          throw new AppError(`Adresár ${folderPath} nie je prázdny`, 400);
        }
      }

      // Vymaž adresár
      await fs.rm(fullPath, { recursive: force, force });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa vymazať adresár: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Získa zoznam adresárov
   */
  async listFolders(dirPath: string, recursive: boolean = false): Promise<FolderInfo[]> {
    try {
      const fullPath = path.join(this.basePath, dirPath);

      // Skontroluj či adresár existuje
      try {
        await fs.access(fullPath, constants.F_OK);
      } catch {
        // Ak adresár neexistuje, vráť prázdny zoznam
        return [];
      }

      // Načítaj adresáre
      return await this.readFoldersRecursive(fullPath, recursive, dirPath);
    } catch (error) {
      throw new AppError(`Nepodarilo sa načítať zoznam adresárov: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Rekurzívne číta adresáre
   */
  private async readFoldersRecursive(dir: string, recursive: boolean, basePath: string = ''): Promise<FolderInfo[]> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const folders: FolderInfo[] = [];

    for (const dirent of dirents) {
      if (dirent.isDirectory()) {
        const res = path.join(dir, dirent.name);
        const relativePath = path.join(basePath, dirent.name);

        // Získaj informácie o adresári
        const stats = await fs.stat(res);

        folders.push({
          name: dirent.name,
          path: relativePath,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
          isDirectory: true
        });

        // Ak je zapnutá rekurzia, pokračuj v čítaní
        if (recursive) {
          const nestedFolders = await this.readFoldersRecursive(res, recursive, relativePath);
          folders.push(...nestedFolders);
        }
      }
    }

    return folders;
  }

  /**
   * Skontroluje či adresár existuje
   */
  async folderExists(folderPath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, folderPath);
      await fs.access(fullPath, constants.F_OK);

      // Skontroluj či je to adresár
      const stats = await fs.stat(fullPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

// Export singleton inštancie
export const folderService = new FolderService();
