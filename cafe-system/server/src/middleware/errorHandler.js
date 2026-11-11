import { ZodError } from 'zod';
import { config } from '../config/index.js';

export function errorHandler(err, req, res, next) {
  console.error('[Error Handler]', err);

  // Zod validation error (when controllers call .parse directly)
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }

  // Body parser syntax error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid JSON payload received',
        code: 'BAD_REQUEST',
      },
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {});
    return res.status(409).json({
      success: false,
      error: {
        message: `Duplicate field value entered: ${fields.join(', ')} must be unique`,
        code: 'CONFLICT',
        details: err.keyValue,
      },
    });
  }

  // Mongoose bad ObjectId / CastError
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        message: `Invalid identifier format: ${err.value}`,
        code: 'INVALID_ID',
      },
    });
  }

  // Default internal server error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: err.code || 'INTERNAL_ERROR',
      ...(config.nodeEnv === 'development' ? { stack: err.stack } : {}),
    },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      message: `Endpoint ${req.method} ${req.originalUrl} not found`,
      code: 'NOT_FOUND',
    },
  });
}

