import { PrismaClient, ImageVariant } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { AppError } from '../middlewares/error-handler';
import { config } from '../config';
import Queue from 'bull';

const prisma = new PrismaClient();

// Bull queue pre asynchrónne spracovanie obrázkov
const imageProcessingQueue = new Queue('image-processing', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password
  }
});

// Preddefinované varianty obrázkov
export const predefinedVariants = {
  thumbnail: { width: 150, height: 150, format: 'webp' as const, quality: 80 },
  small: { width: 320, height: undefined, format: 'webp' as const, quality: 80 },
  medium: { width: 640, height: undefined, format: 'webp' as const, quality: 80 },
  large: { width: 1280, height: undefined, format: 'webp' as const, quality: 80 }
};

// Typy variantov pre použitie v API
export type VariantPreset = keyof typeof predefinedVariants;

// Interface pre parametre vytvárania variantu
export interface VariantOptions {
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff' | 'gif';
  quality?: number;
  crop?: boolean;
  grayscale?: boolean;
  blur?: number;
  rotate?: number;
}

/**
 * Service pre spracovanie obrázkov
 */
export class ImageProcessingService {
  private readonly basePath: string;
  private readonly variantsPath: string;

  constructor() {
    this.basePath = config.storagePath;
    this.variantsPath = path.join(this.basePath, '.variants');
  }

  /**
   * Inicializuje adresárovú štruktúru pre varianty
   */
  async initialize(): Promise<void> {
    if (!config.features.imageProcessing) {
      return; // Spracovanie obrázkov je vypnuté
    }

    try {
      await fs.mkdir(this.variantsPath, { recursive: true });
    } catch (error) {
      console.error('Nepodarilo sa inicializovať adresárovú štruktúru pre varianty:', error);
      throw new AppError('Nepodarilo sa inicializovať spracovanie obrázkov', 500);
    }
  }

  /**
   * Skontroluje, či je súbor obrázok
   */
  isImage(mimeType: string): boolean {
    return /^image\/(jpeg|jpg|png|gif|webp|tiff|svg\+xml|avif)$/.test(mimeType);
  }

  /**
   * Vytvorí/získa variantu obrázka podľa preddefinovaného variantu
   */
  async getPresetVariant(
    fileId: string,
    preset: VariantPreset
  ): Promise<{ buffer: Buffer; variant: ImageVariant }> {
    if (!config.features.imageProcessing) {
      throw new AppError('Spracovanie obrázkov je vypnuté', 400);
    }

    if (!predefinedVariants[preset]) {
      throw new AppError(`Neznámy preset "${preset}"`, 400);
    }

    try {
      // Nájdi súbor
      const file = await prisma.file.findUnique({
        where: { id: fileId }
      });

      if (!file) {
        throw new AppError(`Súbor s ID ${fileId} nebol nájdený`, 404);
      }

      // Skontroluj či je to obrázok
      if (!this.isImage(file.mimeType)) {
        throw new AppError('Súbor nie je obrázok', 400);
      }

      // Skontroluj či už existuje variant
      let variant = await prisma.imageVariant.findFirst({
        where: {
          fileId,
          variantKey: preset
        }
      });

      // Ak variant existuje, vráť ho
      if (variant) {
        const variantPath = path.join(this.variantsPath, variant.path);
        try {
          const buffer = await fs.readFile(variantPath);
          return { buffer, variant };
        } catch (error) {
          // Ak súbor na disku neexistuje, vytvor ho znova
          console.warn(`Variant ${preset} existuje v DB ale súbor chýba na disku, vytváram znova`);
          console.error(error);
        }
      }

      // Vytvor variant asynchrónne
      variant = await this.createVariant(fileId, preset, predefinedVariants[preset]);
      const variantPath = path.join(this.variantsPath, variant.path);
      const buffer = await fs.readFile(variantPath);

      return { buffer, variant };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa získať variant obrázka: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Vytvorí vlastný variant obrázka
   */
  async createCustomVariant(
    fileId: string,
    options: VariantOptions
  ): Promise<{ buffer: Buffer; variant: ImageVariant }> {
    if (!config.features.imageProcessing) {
      throw new AppError('Spracovanie obrázkov je vypnuté', 400);
    }

    try {
      // Nájdi súbor
      const file = await prisma.file.findUnique({
        where: { id: fileId }
      });

      if (!file) {
        throw new AppError(`Súbor s ID ${fileId} nebol nájdený`, 404);
      }

      // Skontroluj či je to obrázok
      if (!this.isImage(file.mimeType)) {
        throw new AppError('Súbor nie je obrázok', 400);
      }

      // Validuj parametre
      if (!options.width && !options.height) {
        throw new AppError('Musí byť zadaná aspoň jedna hodnota: width alebo height', 400);
      }

      // Vytvor unikátny kľúč pre variant
      const variantKey = `custom-${nanoid(8)}`;

      // Vytvor variant
      const variant = await this.createVariant(fileId, variantKey, options);
      const variantPath = path.join(this.variantsPath, variant.path);
      const buffer = await fs.readFile(variantPath);

      return { buffer, variant };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Nepodarilo sa vytvoriť variant obrázka: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Interná metóda pre vytvorenie variantu
   */
  private async createVariant(
    fileId: string,
    variantKey: string,
    options: VariantOptions
  ): Promise<ImageVariant> {
    // Nájdi súbor
    const file = await prisma.file.findUnique({
      where: { id: fileId }
    });

    if (!file) {
      throw new AppError(`Súbor s ID ${fileId} nebol nájdený`, 404);
    }

    // Vytvor adresárovú štruktúru pre varianty
    const fileVariantDir = path.join(this.variantsPath, fileId);
    await fs.mkdir(fileVariantDir, { recursive: true });

    // Cesty k súborom
    const originalFilePath = path.join(this.basePath, file.path);
    const variantFileName = `${variantKey}.${options.format || 'webp'}`;
    const variantFilePath = path.join(fileVariantDir, variantFileName);
    const variantRelativePath = path.join(fileId, variantFileName);

    // Načítaj originálny obrázok
    const inputBuffer = await fs.readFile(originalFilePath);

    // Vytvor Sharp inštanciu
    let sharpInstance = sharp(inputBuffer);

    // Aplikuj veľkosť a fit
    if (options.width || options.height) {
      sharpInstance = sharpInstance.resize({
        width: options.width,
        height: options.height,
        fit: options.crop ? 'cover' : 'inside',
        withoutEnlargement: true
      });
    }

    // Aplikuj grayscale ak je nastavený
    if (options.grayscale) {
      sharpInstance = sharpInstance.grayscale();
    }

    // Aplikuj blur ak je nastavený
    if (options.blur && options.blur > 0) {
      sharpInstance = sharpInstance.blur(options.blur);
    }

    // Aplikuj rotáciu ak je nastavená
    if (options.rotate) {
      sharpInstance = sharpInstance.rotate(options.rotate);
    }

    // Nastav výstupný formát a kvalitu
    const format = options.format || 'webp';
    const formatOptions: { quality?: number } = {};

    if (options.quality) {
      formatOptions.quality = options.quality;
    }

    let outputBuffer: Buffer;

    // Aplikuj formát
    switch (format) {
    case 'jpeg':
      outputBuffer = await sharpInstance.jpeg(formatOptions).toBuffer();
      break;
    case 'png':
      outputBuffer = await sharpInstance.png(formatOptions).toBuffer();
      break;
    case 'webp':
      outputBuffer = await sharpInstance.webp(formatOptions).toBuffer();
      break;
    case 'avif':
      outputBuffer = await sharpInstance.avif(formatOptions).toBuffer();
      break;
    case 'tiff':
      outputBuffer = await sharpInstance.tiff(formatOptions).toBuffer();
      break;
    case 'gif':
      outputBuffer = await sharpInstance.gif().toBuffer();
      break;
    default:
      outputBuffer = await sharpInstance.webp(formatOptions).toBuffer();
    }

    // Ulož výsledný súbor
    await fs.writeFile(variantFilePath, outputBuffer);

    // Zisti veľkosť súboru
    const stats = await fs.stat(variantFilePath);

    // Zisti metadata obrazka pomocou Sharp
    const metadata = await sharp(outputBuffer).metadata();

    // Vytvor záznam v databáze
    const variant = await prisma.imageVariant.upsert({
      where: {
        fileId_variantKey: {
          fileId,
          variantKey
        }
      },
      update: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        quality: options.quality,
        path: variantRelativePath,
        size: stats.size
      },
      create: {
        fileId,
        variantKey,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        quality: options.quality,
        path: variantRelativePath,
        size: stats.size
      }
    });

    return variant;
  }

  /**
   * Získa všetky varianty obrázka
   */
  async getVariants(fileId: string): Promise<ImageVariant[]> {
    if (!config.features.imageProcessing) {
      throw new AppError('Spracovanie obrázkov je vypnuté', 400);
    }

    try {
      const variants = await prisma.imageVariant.findMany({
        where: { fileId }
      });

      return variants;
    } catch (error) {
      throw new AppError(`Nepodarilo sa získať varianty obrázka: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  }

  /**
   * Vymaže všetky varianty obrázka
   */
  async deleteAllVariants(fileId: string): Promise<void> {
    if (!config.features.imageProcessing) {
      return; // Spracovanie obrázkov je vypnuté
    }

    try {
      // Vymaž adresár variantov
      const variantDir = path.join(this.variantsPath, fileId);
      try {
        await fs.rm(variantDir, { recursive: true, force: true });
      } catch (error) {
        // Ignoruj chybu ak adresár neexistuje
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // Vymaž varianty z databázy
      await prisma.imageVariant.deleteMany({
        where: {
          fileId
        }
      });
    } catch (error) {
      console.error(`Nepodarilo sa vymazať varianty obrázka: ${fileId}`, error);
      // Nepremieta chybu nahor, iba loguje - nemalo by blokovať hlavnú operáciu
    }
  }

  /**
   * Asynchrónne spracováva preddefinované varianty po nahraní nového obrázka
   */
  async processImageVariants(fileId: string): Promise<void> {
    if (!config.features.imageProcessing) {
      return; // Spracovanie obrázkov je vypnuté
    }

    try {
      // Nájdi súbor
      const file = await prisma.file.findUnique({
        where: { id: fileId }
      });

      if (!file || !this.isImage(file.mimeType)) {
        return; // Nie je obrázok alebo neexistuje
      }

      // Pridaj do fronty na spracovanie každý preddefinovaný variant
      for (const [preset, options] of Object.entries(predefinedVariants)) {
        await imageProcessingQueue.add('createVariant', {
          fileId,
          variantKey: preset,
          options
        });
      }
    } catch (error) {
      console.error('Chyba pri zaradení obrázka do fronty na spracovanie:', error);
      // Nepremieta chybu nahor, iba loguje - nemalo by blokovať hlavnú operáciu
    }
  }

  /**
   * Spracovanie fronty obrázkov
   * Inicializuje spracovanie obrázkov z Bull queue
   */
  static initializeProcessor(): void {
    if (!config.features.imageProcessing) {
      return; // Spracovanie obrázkov je vypnuté
    }

    imageProcessingQueue.process('createVariant', async (job) => {
      const { fileId, variantKey, options } = job.data;
      const service = new ImageProcessingService();

      try {
        await service.createVariant(fileId, variantKey, options);
        return true;
      } catch (error) {
        console.error(`Chyba pri spracovaní variantu ${variantKey} pre súbor ${fileId}:`, error);
        throw error; // Re-throw pre Bull retry mechanizmus
      }
    });

    // Konfiguruj retry a čistenie
    imageProcessingQueue.on('failed', async (job, err) => {
      console.error(`Spracovanie variantu zlyhalo (pokus ${job.attemptsMade})`, err);

      if (job.attemptsMade >= 5) {
        console.error('Spracovanie variantu bolo zahodené po 5 pokusoch', {
          fileId: job.data.fileId,
          variantKey: job.data.variantKey
        });
      }
    });
  }
}

// Export singleton inštancie
export const imageProcessingService = new ImageProcessingService();

// Inicializuj adresárovú štruktúru pri štarte
if (config.features.imageProcessing) {
  imageProcessingService.initialize().catch(error => {
    console.error('Nepodarilo sa inicializovať spracovanie obrázkov:', error);
  });

  // Inicializuj processor
  ImageProcessingService.initializeProcessor();
}
