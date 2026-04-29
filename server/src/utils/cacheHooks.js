import cache from '../config/cache.js';
import logger from './logger.js';

export const invalidateEntityCache = (entityType, entityId, additionalId = null) => {
  const keys = [];

  if (entityId === 'all') {
    const allKeys = cache.keys();
    const pattern = `${entityType}:all`;
    const listPattern = `${entityType}:list:*`;
    keys.push(...allKeys.filter(k => k === pattern || k.startsWith(`${entityType}:list:`)));
  }

  switch (entityType) {
    case 'student': {
      keys.push(`user:${entityId}`);
      keys.push(`student_status:${entityId}:active`);
      
      const allKeys = cache.keys();
      // Invalidate specific request status keys for this student
      const requestStatusKeys = allKeys.filter(k => k.startsWith(`student_status:${entityId}:`));
      keys.push(...requestStatusKeys);

      // Invalidate lists where this student might appear
      const listStudentKeys = allKeys.filter(k =>
        k.startsWith('students:list:all:') ||
        (additionalId && k.startsWith(`students:list:${additionalId}:`))
      );
      keys.push(...listStudentKeys);
      break;
    }

    case 'faculty':
      keys.push(`user:${entityId}`);
      if (additionalId) keys.push(`faculty_pending:${entityId}:${additionalId}`);
      
      // Invalidate lists where this faculty might appear
      const allFacultyKeys = cache.keys();
      const listFacultyKeys = allFacultyKeys.filter(k =>
        k.startsWith('faculty:list:all:') ||
        (additionalId && k.startsWith(`faculty:list:${additionalId}:`))
      );
      keys.push(...listFacultyKeys);
      break;

    case 'department':
      keys.push(`dept:${entityId}`);
      keys.push(`dept:detail:${entityId}`);
      keys.push('departments:all');
      keys.push(`departments:hod:${entityId}`);
      break;

    case 'class': {
      keys.push(`class:${entityId}`);
      keys.push(`class:detail:${entityId}`);
      
      const allKeys = cache.keys();
      
      // 1. Clear scoped keys (e.g., class:ID:role_admin)
      const scopedKeys = allKeys.filter(k => k.startsWith(`class:${entityId}:`));
      keys.push(...scopedKeys);

      // 2. Wildcard list invalidation for departments
      const listPrefix = additionalId ? `classes:list:dept_${additionalId}` : 'classes:list:';
      const listKeys = allKeys.filter(k => k.startsWith(listPrefix));
      keys.push(...listKeys);
      break;
    }

    case 'batch':
      keys.push(`batch_status:${entityId}`);
      keys.push(`batch_summary:${entityId}`);
      if (additionalId) keys.push(`hod_overview:${additionalId}`);
      break;

    case 'request':
      // entityId = requestId, additionalId = studentId
      // Pass batchId as a third param if available for targeted invalidation
      if (additionalId) keys.push(`student_status:${additionalId}`);
      // Note: callers should pass batchId via a separate direct cache.del call
      // to avoid O(n) key scan. The hook in NodueRequest.js handles this.
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
