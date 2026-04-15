import winston from 'winston';

const levels = {
  error: 0,
  warn: 1,
  audit: 2,
  info: 3,
  http: 4,
  debug: 5,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  audit: 'cyan',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const level = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' ? 'debug' : 'info';
};

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.json()
);

const auditFilter = winston.format((info) => {
  return info.level === 'audit' ? info : false;
});

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.simple()
    ),
  }),
  new winston.transports.File({ 
    filename: 'logs/audit.log', 
    level: 'audit',
    format: winston.format.combine(
      auditFilter(),
      winston.format.json()
    )
  }),
  new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
  new winston.transports.File({ filename: 'logs/combined.log' }),
];

const formatAudit = winston.format((info) => {
  if (info.level === 'audit') {
    info.isAudit = true;
    // Ensure payload is structured for indexing
    if (typeof info.message === 'string') {
      info.action = info.message;
      delete info.message; // Remove string message to keep it structured
    }
  }
  return info;
});

const logger = winston.createLogger({
  level: level(),
  levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    formatAudit(),
    winston.format.json()
  ),
  transports,
});

/**
 * Standardized audit logger for production forensics.
 * @param {string} action - Event identifier (e.g., 'BATCH_INITIATED')
 * @param {Object} metadata - Context (actor, resource_id, diffs, etc.)
 */
logger.audit = (action, metadata = {}) => {
  logger.log('audit', action, { 
    ...metadata,
    log_type: 'AUDIT',
    timestamp: new Date().toISOString()
  });
};

export default logger;
