import NodeCache from 'node-cache';

/**
 * Shared in-process cache.
 * useClones: false — return the same object reference (no deep-clone overhead).
 * stdTTL: 60s default; individual set() calls override per-key.
 */
const cache = new NodeCache({
  stdTTL: 60,           // default TTL: 60 seconds
  checkperiod: 120,     // sweep for expired keys every 2 min
  useClones: false,     // skip deep-clone on get/set — measurably faster
});

export default cache;
