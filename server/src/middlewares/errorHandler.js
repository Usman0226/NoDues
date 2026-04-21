import logger from '../utils/logger.js';

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

  // MongoDB: Network/Selection issues (Usually DNS or Atlas downtime)
  if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError') {
    statusCode = 503;
    code       = 'DATABASE_UNAVAILABLE';
    message    = 'The database is currently unreachable. This is usually temporary. Please try again in a moment.';
  }

  // Fetch / Network Timeouts
  if (err.name === 'AbortError' || err.name === 'TimeoutError') {
    statusCode = 504;
    code       = 'GATEWAY_TIMEOUT';
    message    = 'The request took too long to complete. Please try again.';
  }

  const logData = {
    code,
    statusCode,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString(),
    actor: req.user?.userId ?? 'anonymous',
    action: `${req.method}:${req.path}`,
    resource_id: req.params?.id ?? null,
  };

  if (statusCode >= 500) {
    logger.error(message, logData);
  } else {
    logger.warn(message, logData);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      statusCode,
    },
  });
};
