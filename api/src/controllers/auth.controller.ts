import { Context } from 'hono';
import { authService } from '../services/auth.service';
import { loginSchema, refreshTokenSchema } from '../validators/auth.validator';

/**
 * Kontrolér pre autentifikáciu
 */
export class AuthController {
  /**
   * Prihlásenie používateľa
   */
  async login(c: Context): Promise<Response> {
    // Validuj telo požiadavky
    const body = loginSchema.parse(await c.req.json());

    // Prihlásiť používateľa
    const tokens = await authService.login(body.username, body.password);

    return c.json({
      message: 'Prihlásenie úspešné',
      ...tokens
    });
  }

  /**
   * Obnovenie tokenu
   */
  async refreshToken(c: Context): Promise<Response> {
    // Validuj telo požiadavky
    const body = refreshTokenSchema.parse(await c.req.json());

    // Obnoviť token
    const tokens = await authService.refreshToken(body.refreshToken);

    return c.json({
      message: 'Token obnovený',
      ...tokens
    });
  }

  /**
   * Odhlásenie používateľa
   */
  async logout(c: Context): Promise<Response> {
    // Validuj telo požiadavky
    const body = refreshTokenSchema.parse(await c.req.json());

    // Odhlásiť používateľa
    await authService.logout(body.refreshToken);

    return c.json({
      message: 'Odhlásenie úspešné'
    });
  }
}

// Export singleton inštancie
export const authController = new AuthController();
