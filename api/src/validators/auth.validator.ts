import { z } from 'zod';

/**
 * Validácia pre prihlásenie užívateľa
 */
export const loginSchema = z.object({
  username: z.string()
    .min(3, 'Používateľské meno musí mať aspoň 3 znaky')
    .max(50, 'Používateľské meno je príliš dlhé'),
  password: z.string()
    .min(8, 'Heslo musí mať aspoň 8 znakov')
    .max(100, 'Heslo je príliš dlhé'),
});

/**
 * Validácia pre obnovu tokenu
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token je povinný'),
});
