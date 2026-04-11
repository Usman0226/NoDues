import { logger } from './logger.js';

export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let code       = err.code      || 'INTERNAL_SERVER_ERROR';
  let message    = err.message   || 'Server Error';

  // Mongoose: bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 404;
    code       = 'NOT_FOUND';
    message    = `Resource not found`;
  }

  // Mongoose: duplicate key (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    code       = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message    = `Duplicate value for ${field}`;
  }

  // Mongoose: validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code       = 'VALIDATION_ERROR';
    message    = Object.values(err.errors).map((e) => e.message).join(', ');
  }

  logger.error(message, {
    code,
    statusCode,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString(),
    actor: req.user?.userId ?? 'anonymous',
    action: `${req.method}:${req.path}`,
    resource_id: req.params?.id ?? null,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      statusCode,
    },
  });
};
