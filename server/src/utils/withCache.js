import cache from '../config/cache.js';

export const withCache = async (key, ttl, fetchFn) => {
  const cached = cache.get(key);
  if (cached !== undefined) return cached; 

  const data = await fetchFn();            
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
