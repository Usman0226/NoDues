import { logger } from './logger.js';

/**
 * Dedicated auditor for critical operations as per USER_GLOBAL rules.
 * Tracks timestamp, actor, action, and resource_id.
 */
export const auditLogger = {
  log: (actor, action, resource_id, metadata = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      actor,
      action,
      resource_id,
      ...metadata,
    };
    
    // Log to a dedicated audit stream (in this case, a specific winston level/file)
    logger.info('AUDIT_EVENT', entry);
    
    // In production, this would also write to a dedicated 'audits' table in DB
  }
};
