import { z } from 'zod';

/**
 * Validácia pre vytvorenie priečinka
 */
export const createFolderSchema = z.object({
  path: z.string()
    .min(1, 'Cesta je povinná')
    .max(255, 'Cesta je príliš dlhá')
    .regex(/^[a-zA-Z0-9_\-/.]+$/, 'Cesta obsahuje nepovolené znaky')
    .refine((path) => !path.includes('..'), {
      message: "Cesta nemôže obsahovať '..' (navigácia nahor)",
    }),
  description: z.string().max(500).optional(),
});

/**
 * Validácia pre parameter path adresára
 */
export const folderPathParamSchema = z.object({
  path: z.string()
    .min(1, 'Cesta je povinná')
    .max(255, 'Cesta je príliš dlhá')
    .regex(/^[a-zA-Z0-9_\-/.]+$/, 'Cesta obsahuje nepovolené znaky')
    .refine((path) => !path.includes('..'), {
      message: "Cesta nemôže obsahovať '..' (navigácia nahor)",
    })
});

/**
 * Schéma pre vyžiadanie zoznamu priečinkov
 */
export const listFoldersQuerySchema = z.object({
  path: z.string()
    .max(255, 'Cesta je príliš dlhá')
    .regex(/^[a-zA-Z0-9_\-/.]*$/, 'Cesta obsahuje nepovolené znaky')
    .refine((path) => !path.includes('..'), {
      message: "Cesta nemôže obsahovať '..' (navigácia nahor)",
    })
    .default(''),
  recursive: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
});
