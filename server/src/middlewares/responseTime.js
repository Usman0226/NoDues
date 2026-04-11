import logger from '../utils/logger.js';

export const responseTimeLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const flag =
      duration > 200 ? '🐢 SLOW' :
      duration > 100 ? '⚠️ ' :
      '✅ ';

    logger.info(`${flag} ${req.method} ${req.path} — ${duration}ms`, {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
    });
  });

  next();
};
