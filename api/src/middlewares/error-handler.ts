import { Context } from 'hono';
import { ZodError } from 'zod';
import { HTTPException } from 'hono/http-exception';

/**
 * Custom error class pre aplikačné errory
 */
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Globálny error handler pre aplikáciu
 */
export const errorHandler = (err: Error, c: Context) => {
  console.error('Error:', err);

  // Zod validation errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map(error => ({
      path: error.path.join('.'),
      message: error.message
    }));

    return c.json({
      error: 'Validation Error',
      details: formattedErrors
    }, 400);
  }

  // Custom application errors
  if (err instanceof AppError) {
    c.status(err.statusCode as HTTPException['status']);
    return c.json({
      error: err.message
    });
  }

  // Hono HTTP exceptions
  if (err instanceof HTTPException) {
    return c.json({
      error: err.message
    }, err.status);
  }

  // Generic error handling
  const statusCode = 500;
  const message = 'Internal Server Error';

  // V produkčnom prostredí neodhaľujeme podrobnosti o chybe
  return c.json({
    error: message
  }, statusCode);
};
