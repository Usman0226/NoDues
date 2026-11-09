import FeatureFlag from '../models/FeatureFlag.js';
import logger from './logger.js';

// In-memory short-TTL cache (5 seconds) strictly adhering to FR-F5 (TTL <= 10s)
const flagCache = new Map();
const CACHE_TTL_MS = 5000;

/**
 * Checks whether a feature flag is enabled.
 * Evaluates with a 5-second TTL cache for high-throughput performance.
 *
 * @param {string} flagName
 * @returns {Promise<boolean>}
 */
export async function isFeatureEnabled(flagName) {
  const now = Date.now();
  const cached = flagCache.get(flagName);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.enabled;
  }

  try {
    const flag = await FeatureFlag.findOne({ name: flagName }).lean();
    const enabled = Boolean(flag?.enabled);
    flagCache.set(flagName, { enabled, timestamp: now });
    return enabled;
  } catch (err) {
    logger.error('Error fetching feature flag', {
      flagName,
      error: err.message,
    });
    // Safe fallback: disabled
    return false;
  }
}

/**
 * Sets or updates a feature flag in the database and clears the local cache.
 *
 * @param {string} flagName
 * @param {boolean} enabled
 * @param {string} [description]
 * @param {string} [updatedBy]
 */
export async function setFeatureFlag(flagName, enabled, description = '', updatedBy = null) {
  const flag = await FeatureFlag.findOneAndUpdate(
    { name: flagName },
    {
      $set: {
        enabled: Boolean(enabled),
        description,
        updatedBy,
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  flagCache.delete(flagName);
  logger.info('Feature flag updated', { flagName, enabled });
  return flag;
}

/**
 * Express middleware to guard routes behind a database feature flag.
 * If disabled, returns 404 with FEAT_001.
 *
 * @param {string} flagName
 */
export function requireFeature(flagName) {
  return async (req, res, next) => {
    const enabled = await isFeatureEnabled(flagName);
    if (!enabled) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FEAT_001',
          message: `The requested feature is not currently enabled`,
        },
      });
    }
    next();
  };
}

/**
 * Clears the feature flag cache (useful in tests)
 */
export function clearFeatureFlagCache() {
  flagCache.clear();
}
