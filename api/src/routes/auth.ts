import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authController } from '../controllers/auth.controller';
import { loginSchema, refreshTokenSchema } from '../validators/auth.validator';

// Vytvor router pre autentifikáciu
const router = new Hono();

// Prihlásenie
router.post('/login', zValidator('json', loginSchema), authController.login);

// Obnovenie tokenu
router.post('/refresh', zValidator('json', refreshTokenSchema), authController.refreshToken);

// Odhlásenie
router.post('/logout', zValidator('json', refreshTokenSchema), authController.logout);

export { router as authRouter };
