import mongoose from 'mongoose';
import { pushEvent } from '../Controllers/sseController.js';
import logger from './logger.js';

/**
 * MongoDB Change Streams for multi-instance SSE synchronization.
 *
 * Disabled by default on single-instance deployments (Render + Atlas M0)
 * because controllers already call pushEvent() directly after commits,
 * and fullDocument: 'updateLookup' doubles read IOPS on M0.
 * Set ENABLE_CHANGE_STREAMS=true only when scaling horizontally without Redis Pub/Sub.
 */
let isInitialized = false;
let approvalStream = null;

export const initChangeStreams = async () => {
  if (isInitialized) return;
  isInitialized = true;

  if (process.env.ENABLE_CHANGE_STREAMS !== 'true') {
    logger.info('MongoDB Change Streams disabled (single-instance mode; direct SSE push active).');
    return;
  }

  const db = mongoose.connection;

  try {
    const admin = db.db.admin();
    const serverInfo = await admin.command({ hello: 1 });
    const isReplicaSet = !!(serverInfo.setName || serverInfo.isWritablePrimary);

    if (!isReplicaSet) {
      logger.warn('MongoDB Change Stream: Standalone server detected. Multi-instance SSE sync disabled.');
      return;
    }
  } catch (err) {
    logger.debug('ChangeStream: Capability check failed, will attempt opportunistic watch.', { error: err.message });
  }

  try {
    approvalStream = db.collection('nodueapprovals').watch([], { fullDocument: 'updateLookup' });

    approvalStream.on('change', (change) => {
      try {
        const { operationType, fullDocument } = change;
        if ((operationType === 'update' || operationType === 'insert') && fullDocument) {
          const { studentId, facultyId, batchId, action } = fullDocument;
          if (studentId) {
            pushEvent([studentId.toString()], 'APPROVAL_UPDATED', {
              batchId: batchId?.toString(),
              action,
            });
          }
          if (facultyId) {
            pushEvent([facultyId.toString()], 'PENDING_LIST_UPDATE', {
              batchId: batchId?.toString(),
            });
          }
        }
      } catch (err) {
        logger.error('change_stream_approval_process_error', { error: err.message });
      }
    });

    approvalStream.on('error', (err) => {
      if (err.message.includes('changeStream stage is only supported on replica sets')) {
        logger.warn('MongoDB Change Stream: Feature disabled (Replica Set required).');
      } else {
        logger.error('approval_change_stream_error', { error: err.message });
      }
    });

    logger.info('MongoDB Change Stream: NodueApproval watcher active.');
  } catch (err) {
    if (err.message.includes('changeStream')) {
      logger.warn('MongoDB Change Stream: NodueApproval watcher disabled (Replica Set required).');
    } else {
      logger.error('MongoDB Change Stream: Failed to start NodueApproval watcher.', { error: err.message });
    }
  }
};

export const closeChangeStreams = async () => {
  if (approvalStream) {
    await approvalStream.close().catch(() => {});
    approvalStream = null;
  }
  isInitialized = false;
};
