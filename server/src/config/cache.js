import NodeCache from 'node-cache';

/**
 * Shared in-process cache.
 * useClones: false — return the same object reference (no deep-clone overhead).
 * stdTTL: 60s default; individual set() calls override per-key.
 */
const cache = new NodeCache({
  stdTTL: 10,           // tighter TTL for multi-instance consistency
  checkperiod: 60,      // sweep for expired keys every 1 min
  useClones: false,     // performance optimization
});

export default cache;
