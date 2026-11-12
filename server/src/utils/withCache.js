import cache from '../config/cache.js';

const inFlight = new Map();
const invalidatedWhileInFlight = new Set();

export const withCache = async (key, ttl, fetchFn) => {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = (async () => {
    try {
      const data = await fetchFn();
      if (!invalidatedWhileInFlight.has(key)) {
        try {
          cache.set(key, data, ttl);
        } catch {
          // Gracefully bypass caching if maxKeys cap (ECACHEFULL) is reached under spike load
        }
      }
      return data;
    } finally {
      inFlight.delete(key);
      invalidatedWhileInFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
};

/**
 * Delete one or more cache keys atomically and prevent any in-flight
 * read for those keys from writing stale data back into the cache.
 *
 * @param {string|string[]} keys
 */
export const invalidateKeys = (keys) => {
  const keyArr = Array.isArray(keys) ? keys : [keys];
  if (!keyArr.length) return;

  for (const k of keyArr) {
    if (inFlight.has(k)) {
      invalidatedWhileInFlight.add(k);
    }
  }
  cache.del(keyArr);
};
