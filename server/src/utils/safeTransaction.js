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
import mongoose from 'mongoose';
import logger from './logger.js';

/**
 * Checks if the current MongoDB connection supports transactions.
 * Transactions require a replica set or sharded cluster.
 * Standalone instances (common in local dev) do not support them.
 * 
 * @returns {boolean}
 */
export const isTransactionSupported = () => {
  try {
    const topologyType = mongoose.connection.getClient()?.topology?.description?.type;
    logger.info('safeTransaction: Detected topology type:', { topologyType });
    // Transactions are supported on ReplicaSetNoPrimary, ReplicaSetWithPrimary, and Sharded topologies.
    // They are NOT supported on Single (standalone) or Unknown.
    const supported = topologyType && topologyType !== 'Single' && topologyType !== 'Unknown';
    if (!supported) {
      logger.warn('safeTransaction: Transactions NOT supported on this topology. Falling back to non-atomic mode.');
    }
    return supported;
  } catch (err) {
    logger.error('safeTransaction: Error checking topology support', { error: err.message });
    return false;
  }
};

/**
 * Returns the session options object only if a transaction is supported and active.
 * Use this for write operations (save, findOneAndUpdate, etc.) to prevent 
 * "transaction number mismatch" errors on standalone instances.
 * 
 * @param {ClientSession} session 
 * @returns {Object} { session } or {}
 */
export const getSessionOptions = (session) => {
  if (session && session.inTransaction()) {
    return { session };
  }
  return {};
};

/**
 * Try to start a transaction on an existing session.
 * If the server is not a replica-set member (M0 / standalone),
 * the error is swallowed and the session is used without a transaction.
 *
 * @param {ClientSession} session - An already-created Mongoose session
 */
export const startSafeTransaction = async (session) => {
  try {
    if (!isTransactionSupported()) {
      // Standalone detected, skipping startTransaction to prevent txnNumber errors on writes
      return;
    }
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
