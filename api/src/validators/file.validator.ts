import { z } from 'zod';
import { config } from '../config';

/**
 * Validácia pre parameter path
 */
export const pathParamSchema = z.object({
  path: z.string()
    .min(1, 'Cesta je povinná')
    .max(255, 'Cesta je príliš dlhá')
    .regex(/^[a-zA-Z0-9_\-/.]+$/, 'Cesta obsahuje nepovolené znaky')
    .refine((path) => !path.includes('..'), {
      message: "Cesta nemôže obsahovať '..' (navigácia nahor)",
    })
});

/**
 * Schéma pre file metadata
 */
export const fileMetadataSchema = z.object({
  description: z.string().max(500).optional(),
  tags: z.array(z.string()).max(10).optional(),
  isPublic: z.boolean().default(true),
  expiresAt: z.string().datetime().optional(),
});

/**
 * Validácia pre upload súboru
 */
export const uploadFileSchema = z.object({
  filename: z.string()
    .min(1, 'Názov súboru je povinný')
    .max(255, 'Názov súboru je príliš dlhý')
    .regex(/^[a-zA-Z0-9_\-.]+$/, 'Názov súboru obsahuje nepovolené znaky'),
  path: z.string()
    .max(255, 'Cesta je príliš dlhá')
    .regex(/^[a-zA-Z0-9_\-/.]*$/, 'Cesta obsahuje nepovolené znaky')
    .refine((path) => !path.includes('..'), {
      message: "Cesta nemôže obsahovať '..' (navigácia nahor)",
    })
    .default(''),
  metadata: fileMetadataSchema.optional(),
});

/**
 * Validácia MIME typu súboru
 */
export const validateMimeType = (mimeType: string): boolean => {
  return config.allowedMimeTypes.includes(mimeType);
};

/**
 * Validácia veľkosti súboru
 */
export const validateFileSize = (size: number): boolean => {
  return size <= config.maxFileSize;
};

/**
 * Schéma pre vyžiadanie zoznamu súborov
 */
export const listFilesQuerySchema = z.object({
  path: z.string()
    .max(255, 'Cesta je príliš dlhá')
    .regex(/^[a-zA-Z0-9_\-/.]*$/, 'Cesta obsahuje nepovolené znaky')
    .refine((path) => !path.includes('..'), {
      message: "Cesta nemôže obsahovať '..' (navigácia nahor)",
    })
    .default(''),
  recursive: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).default('50'),
});
