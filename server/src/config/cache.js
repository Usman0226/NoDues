import NodeCache from 'node-cache';

/**
 * In-process LRU cache for hot read paths.
 *
 * TTL strategy (per api_performance_guide.md):
 *  - student_status:{id}          → 30s  (set explicitly in withCache calls)
 *  - batch_status:{id}            → 60s  (set explicitly)
 *  - faculty_pending:{id}:{batch} → 30s  (set explicitly)
 *  - batch_summary:{id}           → 30s  (set explicitly)
 *  - class:* / faculty:*          → 300s (set explicitly)
 *  - dept:* / subject:*           → 3600s (set explicitly)
 *  - user:*                       → 900s  (set explicitly in getMe)
 *  - stdTTL below = fallback for any key not given an explicit TTL
 *
 * At 500 concurrent users, a 10s TTL means nearly every request is a
 * cache miss → DB hit. 60s is the correct floor.
 */
const cache = new NodeCache({
  stdTTL: 60,           // default TTL: 60 seconds (was 10 — far too low)
  checkperiod: 120,     // sweep for expired keys every 2 min (was 60)
  useClones: false,     // return object references — faster, no deep clone overhead
});

export default cache;