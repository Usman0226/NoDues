import cache from '../config/cache.js';
import logger from './logger.js';

/**
 * Atomic cache invalidation for key entities.
 * Decouples model logic from specific cache key strings.
 */
export const invalidateEntityCache = (entityType, entityId, additionalId = null) => {
  const keys = [];

  if (entityId === 'all') {
    const allKeys = cache.keys();
    const pattern = `${entityType}:all`;
    const listPattern = `${entityType}:list:*`;
    keys.push(...allKeys.filter(k => k === pattern || k.startsWith(`${entityType}:list:`)));
  }

  switch (entityType) {
    case 'student':
      keys.push(`user:${entityId}`);
      keys.push(`student_status:${entityId}`);
      break;

    case 'faculty':
      keys.push(`user:${entityId}`);
      // If faculty holds a role that causes pending lists, we might clear those too
      if (additionalId) keys.push(`faculty_pending:${entityId}:${additionalId}`);
      break;

    case 'department':
      keys.push(`dept:${entityId}`);
      keys.push(`dept:detail:${entityId}`);
      keys.push('departments:all');
      keys.push(`departments:hod:${entityId}`);
      break;

    case 'class':
      keys.push(`class:${entityId}`);
      keys.push(`class:detail:${entityId}`);
      // Wildcard list invalidation
      const allKeys = cache.keys();
      const listPrefix = additionalId ? `classes:list:dept_${additionalId}` : 'classes:list:';
      const listKeys = allKeys.filter(k => k.startsWith(listPrefix));
      keys.push(...listKeys);
      break;

    case 'batch':
      keys.push(`batch_status:${entityId}`);
      keys.push(`batch_summary:${entityId}`);
      if (additionalId) keys.push(`hod_overview:${additionalId}`);
      break;

    case 'request':
      // entityId = requestId, additionalId = studentId (optional)
      // We need batchId too to be perfect, but let's assume we pass it if we can.
      if (additionalId) keys.push(`student_status:${additionalId}`);
      // Wildcard for batch status since we don't have batchId easily here without more params
      const allKeysReq = cache.keys();
      const batchStatusKeys = allKeysReq.filter(k => k.startsWith('batch_status:'));
      keys.push(...batchStatusKeys);
      break;

    case 'approval':
      // entityId = facultyId, additionalId = batchId
      keys.push(`faculty_pending:${entityId}:${additionalId}`);
      keys.push(`batch_status:${additionalId}`);
      keys.push(`batch_summary:${additionalId}`);
      break;

    default:
      logger.warn('unknown_entity_invalidation', { entityType, entityId });
  }

  if (keys.length > 0) {
    cache.del(keys);
    logger.debug('cache_invalidated', { entityType, entityId, keys });
  }
};
