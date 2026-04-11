import cache from '../config/cache.js';

/**
 * Cache-aside pattern helper.
 *
 * Returns cached data if available; otherwise executes fetchFn, caches the
 * result with the specified TTL, and returns it.
 *
 * @param {string}   key     - Cache key
 * @param {number}   ttl     - TTL in seconds
 * @param {Function} fetchFn - Async function that fetches fresh data on a miss
 * @returns {Promise<*>}
 *
 * @example
 * const data = await withCache(`student_status:${studentId}`, 30, () =>
 *   buildStudentStatus(studentId)
 * );
 */
export const withCache = async (key, ttl, fetchFn) => {
  const cached = cache.get(key);
  if (cached !== undefined) return cached; // cache hit — O(1) in-memory return

  const data = await fetchFn();            // cache miss — hit DB or compute
  cache.set(key, data, ttl);
  return data;
};

/**
 * Delete one or more cache keys atomically.
 * Accepts a single key or array of keys.
 *
 * @param {string|string[]} keys
 */
export const invalidateKeys = (keys) => {
  const keyArr = Array.isArray(keys) ? keys : [keys];
  if (keyArr.length) cache.del(keyArr);
};
