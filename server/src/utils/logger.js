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
  ...(process.env.NODE_ENV === 'production' 
    ? [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
      ]
    : [])
];

const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
});

logger.audit = (action, payload) => {
  logger.log('audit', action, { 
    ...payload,
    timestamp: new Date().toISOString()
  });
};

export default logger;
