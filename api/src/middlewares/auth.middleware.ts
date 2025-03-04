import { MiddlewareHandler } from 'hono';
import { jwtVerify } from 'jose';
import { AppError } from './error-handler';
import { config } from '../config';
import { UserPayload } from '../types';

/**
 * Middleware pre autentifikáciu užívateľa cez JWT
 */
export const authenticate: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Unauthorized - Missing or invalid token', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const encoder = new TextEncoder();
    const secretKey = encoder.encode(config.jwtSecret);

    const { payload } = await jwtVerify(token, secretKey);

    // Pridaj dekódovaný token do kontextu
    c.set('user', payload as UserPayload);

    await next();
  } catch (error) {
    if (error instanceof Error) {
      throw new AppError(`Unauthorized - ${error.message}`, 401);
    }
    throw new AppError('Unauthorized - Invalid token', 401);
  }
};

/**
 * Middleware pre kontrolu role užívateľa
 */
export const authorize = (allowedRoles: string[]): MiddlewareHandler => {
  return async (c, next) => {
    const user = c.get('user');

    if (!user || !allowedRoles.includes(user.role)) {
      throw new AppError('Forbidden - Insufficient permissions', 403);
    }

    await next();
  };
};
