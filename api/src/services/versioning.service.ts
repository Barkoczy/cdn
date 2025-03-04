import { PrismaClient, FileVersion } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'crypto';
import { AppError } from '../middlewares/error-handler';
import { config } from '../config';
import { webhookService, WebhookEventType } from './webhook.service';

const prisma = new PrismaClient();

/**
 * Service pre verziovanie súborov
 */
export class VersioningService {
  private readonly basePath: string;
  private readonly versionsPath: string;

  constructor() {
    this.basePath = config.storagePath;
    this.versionsPath = path.join(this.basePath, '.versions');
  }

  /**
   * Inicializuje adresárovú štruktúru pre verziovanie
   */
  async initialize(): Promise<void> {
    if (!config.features.versioning) {
      return; // Verziovanie je vypnuté
    }

    try {
      await fs.mkdir(this.versionsPath, { recursive: true });
    } catch {
      throw new AppError('Nepodarilo sa inicializovať verziovanie súborov', 500);
    }
  }

  /**
   * Vytvorí novú verziu súboru
   */
  async createVersion(fileId: string, originalPath: string): Promise<FileVersion> {
    if (!config.features.versioning) {
      throw new AppError('Verziovanie súborov je vypnuté', 400);
    }

    try {
      // Nájdi súbor
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        include: {
          versions: {
            orderBy: {
              versionNumber: 'desc'
            },
            take: 1
          }
        }
      });

      if (!file) {
        throw new AppError(`Súbor s ID ${fileId} nebol nájdený`, 404);
      }

      // Zisti najvyššie číslo verzie
      const latestVersionNumber = file.versions.length > 0
        ? file.versions[0].versionNumber
        : 0;

      const newVersionNumber = latestVersionNumber + 1;

      // Vytvor adresárovú štruktúru pre verziovanie
      const fileVersionDir = path.join(this.versionsPath, fileId);
      await fs.mkdir(fileVersionDir, { recursive: true });

      // Cesty k súborom
      const originalFilePath = path.join(this.basePath, originalPath);
      const versionedFilePath = path.join(fileVersionDir, `v${newVersionNumber}`);

      // Skopíruj súbor do verziovacieho adresára
      await fs.copyFile(originalFilePath, versionedFilePath);

      // Zisti veľkosť a checksum
      const stats = await fs.stat(versionedFilePath);
      const fileBuffer = await fs.readFile(versionedFilePath);
      const checksum = createHash('md5').update(fileBuffer).digest('hex');

      // Ulož verziu v databáze
      const version = await prisma.fileVersion.create({
        data: {
          fileId,
          versionNumber: newVersionNumber,
          path: `${fileId}/v${newVersionNumber}`,
          size: stats.size,
          checksum
        }
      });

      // Trigger webhook eventu
      await webhookService.triggerEvent(WebhookEventType.VERSION_CREATED, {
        fileId,
        versionNumber: newVersionNumber,
        fileName: file.name,
        filePath: file.path,
        size: stats.size
      });

      return version;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa vytvoriť verziu súboru: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Získa všetky verzie súboru
   */
  async getVersions(fileId: string): Promise<FileVersion[]> {
    if (!config.features.versioning) {
      throw new AppError('Verziovanie súborov je vypnuté', 400);
    }

    try {
      const versions = await prisma.fileVersion.findMany({
        where: { fileId },
        orderBy: { versionNumber: 'desc' }
      });

      return versions;
    } catch (error) {
      throw new AppError(`Nepodarilo sa získať verzie súboru: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Získa konkrétnu verziu súboru
   */
  async getVersion(fileId: string, versionNumber: number): Promise<Buffer> {
    if (!config.features.versioning) {
      throw new AppError('Verziovanie súborov je vypnuté', 400);
    }

    try {
      // Nájdi verziu v databáze
      const version = await prisma.fileVersion.findFirst({
        where: {
          fileId,
          versionNumber
        }
      });

      if (!version) {
        throw new AppError(`Verzia ${versionNumber} súboru s ID ${fileId} nebola nájdená`, 404);
      }

      // Cesta k verzii súboru
      const versionedFilePath = path.join(this.versionsPath, fileId, `v${versionNumber}`);

      // Načítaj súbor
      try {
        const buffer = await fs.readFile(versionedFilePath);
        return buffer;
      } catch {
        throw new AppError(`Súbor verzie ${versionNumber} nebol nájdený na disku`, 404);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa získať verziu súboru: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Obnoví súbor na konkrétnu verziu
   */
  async restoreVersion(fileId: string, versionNumber: number, userId: string): Promise<void> {
    if (!config.features.versioning) {
      throw new AppError('Verziovanie súborov je vypnuté', 400);
    }

    try {
      // Nájdi súbor a skontroluj oprávnenia
      const file = await prisma.file.findFirst({
        where: {
          id: fileId,
          userId
        }
      });

      if (!file) {
        throw new AppError(`Súbor s ID ${fileId} nebol nájdený alebo nemáte oprávnenie na jeho úpravu`, 404);
      }

      // Nájdi verziu
      const version = await prisma.fileVersion.findFirst({
        where: {
          fileId,
          versionNumber
        }
      });

      if (!version) {
        throw new AppError(`Verzia ${versionNumber} súboru nebola nájdená`, 404);
      }

      // Cesty k súborom
      const versionedFilePath = path.join(this.versionsPath, fileId, `v${versionNumber}`);
      const currentFilePath = path.join(this.basePath, file.path, file.name);

      // Najprv vytvor novú verziu aktuálneho súboru
      await this.createVersion(fileId, path.join(file.path, file.name));

      // Potom obnov zo starej verzie
      await fs.copyFile(versionedFilePath, currentFilePath);

      // Aktualizuj metadata súboru
      const stats = await fs.stat(currentFilePath);
      const fileBuffer = await fs.readFile(currentFilePath);
      const checksum = createHash('md5').update(fileBuffer).digest('hex');

      await prisma.file.update({
        where: { id: fileId },
        data: {
          size: stats.size,
          updatedAt: new Date(),
          checksum
        }
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa obnoviť verziu súboru: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Vymaže konkrétnu verziu súboru
   */
  async deleteVersion(fileId: string, versionNumber: number, userId: string): Promise<void> {
    if (!config.features.versioning) {
      throw new AppError('Verziovanie súborov je vypnuté', 400);
    }

    try {
      // Skontroluj oprávnenia
      const file = await prisma.file.findFirst({
        where: {
          id: fileId,
          userId
        }
      });

      if (!file) {
        throw new AppError(`Súbor s ID ${fileId} nebol nájdený alebo nemáte oprávnenie na jeho úpravu`, 404);
      }

      // Nájdi verziu
      const version = await prisma.fileVersion.findFirst({
        where: {
          fileId,
          versionNumber
        }
      });

      if (!version) {
        throw new AppError(`Verzia ${versionNumber} súboru nebola nájdená`, 404);
      }

      // Vymaž súbor verzie
      const versionedFilePath = path.join(this.versionsPath, fileId, `v${versionNumber}`);
      await fs.unlink(versionedFilePath);

      // Vymaž verziu z databázy
      await prisma.fileVersion.delete({
        where: {
          id: version.id
        }
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa vymazať verziu súboru: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Vymaže všetky verzie súboru
   */
  async deleteAllVersions(fileId: string, userId: string): Promise<void> {
    if (!config.features.versioning) {
      throw new AppError('Verziovanie súborov je vypnuté', 400);
    }

    try {
      // Skontroluj oprávnenia
      const file = await prisma.file.findFirst({
        where: {
          id: fileId,
          userId
        }
      });

      if (!file) {
        throw new AppError(`Súbor s ID ${fileId} nebol nájdený alebo nemáte oprávnenie na jeho úpravu`, 404);
      }

      // Vymaž adresár verzií
      const versionDir = path.join(this.versionsPath, fileId);
      try {
        await fs.rm(versionDir, { recursive: true, force: true });
      } catch (error) {
        // Ignoruj chybu ak adresár neexistuje
        console.error('Nepodarilo sa vymazať adresár verzií: (Ignoruj chybu ak adresár neexistuje)', error);
      }

      // Vymaž verzie z databázy
      await prisma.fileVersion.deleteMany({
        where: {
          fileId
        }
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa vymazať verzie súboru: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Porovná dve verzie súboru (vráti rozdiely v bajtech)
   */
  async compareVersions(fileId: string, versionA: number, versionB: number): Promise<{
    differentBytes: number,
    totalBytes: number,
    differencePercentage: number
  }> {
    if (!config.features.versioning) {
      throw new AppError('Verziovanie súborov je vypnuté', 400);
    }

    try {
      // Nájdi verzie
      const versionAData = await prisma.fileVersion.findFirst({
        where: {
          fileId,
          versionNumber: versionA
        }
      });

      const versionBData = await prisma.fileVersion.findFirst({
        where: {
          fileId,
          versionNumber: versionB
        }
      });

      if (!versionAData || !versionBData) {
        throw new AppError('Jedna alebo obe verzie neboli nájdené', 404);
      }

      // Ak sú checksums rovnaké, súbory sú identické
      if (versionAData.checksum && versionBData.checksum &&
          versionAData.checksum === versionBData.checksum) {
        return {
          differentBytes: 0,
          totalBytes: versionAData.size,
          differencePercentage: 0
        };
      }

      // Načítaj obidva súbory
      const fileAPath = path.join(this.versionsPath, fileId, `v${versionA}`);
      const fileBPath = path.join(this.versionsPath, fileId, `v${versionB}`);

      const bufferA = await fs.readFile(fileAPath);
      const bufferB = await fs.readFile(fileBPath);

      // Porovnaj obsah
      const maxLength = Math.max(bufferA.length, bufferB.length);
      let differentBytes = 0;

      for (let i = 0; i < maxLength; i++) {
        if (i >= bufferA.length || i >= bufferB.length || bufferA[i] !== bufferB[i]) {
          differentBytes++;
        }
      }

      return {
        differentBytes,
        totalBytes: maxLength,
        differencePercentage: (differentBytes / maxLength) * 100
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa porovnať verzie súboru: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }
}

// Export singleton inštancie
export const versioningService = new VersioningService();

// Inicializuj adresárovú štruktúru pri štarte
if (config.features.versioning) {
  versioningService.initialize().catch(error => {
    console.error('Nepodarilo sa inicializovať verziovanie:', error);
  });
}
