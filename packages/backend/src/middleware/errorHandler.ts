/**
 * Hylink EMS - Error Handling Middleware
 * Centralized error handling with proper logging
 */

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
import { AppError, isOperationalError, ValidationError } from '../utils/errors.js';
import { config } from '../config/index.js';
import { ApiResponse } from '../types/index.js';

/**
 * Convert Prisma errors to AppError
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002': // Unique constraint violation
      const field = (error.meta?.target as string[])?.join(', ') || 'field';
      return new AppError(`Duplicate value for ${field}`, 409, 'DUPLICATE_ENTRY');

    case 'P2025': // Record not found
      return new AppError('Record not found', 404, 'NOT_FOUND');

    case 'P2003': // Foreign key constraint
      return new AppError('Related record not found', 400, 'FOREIGN_KEY_ERROR');

    case 'P2014': // Required relation violation
      return new AppError('Required relation constraint violated', 400, 'RELATION_ERROR');

    default:
      logger.error('Unhandled Prisma error', { code: error.code, meta: error.meta });
      return new AppError('Database operation failed', 500, 'DATABASE_ERROR');
  }
}

/**
 * Convert Zod validation errors to ValidationError
 */
function handleZodError(error: ZodError): ValidationError {
  const errors = error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
  }));
  return new ValidationError(errors);
}

/**
 * Main error handling middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let appError: AppError;

  // Convert various error types to AppError
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    appError = handlePrismaError(error);
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    appError = new AppError('Invalid data provided', 400, 'VALIDATION_ERROR');
  } else if (error instanceof ZodError) {
    appError = handleZodError(error);
  } else if (error.name === 'JsonWebTokenError') {
    appError = new AppError('Invalid token', 401, 'INVALID_TOKEN');
  } else if (error.name === 'TokenExpiredError') {
    appError = new AppError('Token expired', 401, 'TOKEN_EXPIRED');
  } else {
    // Unknown error - treat as internal server error
    appError = new AppError(
      config.nodeEnv === 'production' ? 'Internal server error' : error.message,
      500,
      'INTERNAL_ERROR',
      false
    );
  }

  // Log error
  const logContext = {
    errorCode: appError.code,
    statusCode: appError.statusCode,
    path: req.path,
    method: req.method,
    userId: (req as { user?: { id: string } }).user?.id,
    ip: req.ip,
  };

  if (isOperationalError(appError)) {
    logger.warn('Operational error', { ...logContext, message: appError.message });
  } else {
    logger.error('Programming error', { ...logContext, message: appError.message, stack: error.stack });
  }

  // Build response
  const response: ApiResponse = {
    success: false,
    message: appError.message,
  };

  // Add validation errors if present
  if (appError instanceof ValidationError) {
    response.errors = appError.errors;
  }

  // Add error details in development
  if (config.nodeEnv === 'development' && appError.details) {
    (response as { details?: unknown }).details = appError.details;
  }

  res.status(appError.statusCode).json(response);
}

/**
 * Handle 404 - Route not found
 */
export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiResponse = {
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  };
  res.status(404).json(response);
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validate request body with Zod schema
 */
export function validateBody<T>(schema: { parse: (data: unknown) => T }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validate query parameters with Zod schema
 */
export function validateQuery<T>(schema: { parse: (data: unknown) => T }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as typeof req.query;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validate route parameters with Zod schema
 */
export function validateParams<T>(schema: { parse: (data: unknown) => T }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as typeof req.params;
      next();
    } catch (error) {
      next(error);
    }
  };
}
