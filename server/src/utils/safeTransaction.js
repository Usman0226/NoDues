/**
 * safeTransaction.js
 *
 * Environment-aware MongoDB transaction helpers.
 * MongoDB Atlas M0 (free tier) and standalone instances do NOT support
 * multi-document transactions (replica set required). These helpers
 * silently degrade to session-without-transaction on non-replica-set
 * deployments so operations still complete — just without ACID atomicity.
 *
 * On Atlas M2+ or any replica set deployment, full transactions are used.
 */
import logger from './logger.js';

/**
 * Try to start a transaction on an existing session.
 * If the server is not a replica-set member (M0 / standalone),
 * the error is swallowed and the session is used without a transaction.
 *
 * @param {ClientSession} session - An already-created Mongoose session
 */
export const startSafeTransaction = async (session) => {
  try {
    session.startTransaction();
  } catch (err) {
    if (
      err.message?.includes('Transaction numbers are only allowed') ||
      err.codeName === 'IllegalOperation' ||
      err.code === 20
    ) {
      logger.warn('safeTransaction: Replica set not detected — running without ACID transactions. Upgrade to Atlas M2+ for full transaction support.', {
        timestamp: new Date().toISOString(),
      });
      // Do NOT re-throw — let the operation proceed without a transaction
    } else {
      // Unexpected error — propagate it
      throw err;
    }
  }
};

/**
 * Commit the transaction if one is currently active.
 * No-op if no transaction was started (M0 / standalone mode).
 *
 * @param {ClientSession} session
 */
export const commitSafeTransaction = async (session) => {
  if (session.inTransaction()) {
    await session.commitTransaction();
  }
};

/**
 * Abort the transaction if one is currently active.
 * No-op if no transaction was started (M0 / standalone mode).
 *
 * @param {ClientSession} session
 */
export const abortSafeTransaction = async (session) => {
  if (session.inTransaction()) {
    try {
      await session.abortTransaction();
    } catch (err) {
      logger.warn('safeTransaction: Failed to abort transaction (it may have been already aborted by MongoDB).', {
        error: err.message
      });
    }
  }
};
