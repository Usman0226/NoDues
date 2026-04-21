import mongoose from 'mongoose';
import { pushEvent } from '../Controllers/sseController.js';
import logger from './logger.js';

/**
 * Initializes MongoDB Change Streams to synchronize SSE events across multiple server instances.
 * This ensures that a database update on Instance A triggers an SSE notification 
 * on Instance B, C, etc.
 */
let isInitialized = false;

/**
 * Initializes MongoDB Change Streams to synchronize SSE events across multiple server instances.
 */
export const initChangeStreams = async () => {
    if (isInitialized) return;

    const db = mongoose.connection;
    
    // Check for Replica Set support before starting
    try {
        const admin = db.db.admin();
        const serverInfo = await admin.command({ hello: 1 });
        
        // Standalone instances don't have 'setName' or 'isWritablePrimary' in the same way as replica sets
        const isReplicaSet = !!(serverInfo.setName || serverInfo.isWritablePrimary);
        
        if (!isReplicaSet) {
            logger.warn('MongoDB Change Stream: Standalone server detected. Real-time SSE sync disabled (Replica Set required).');
            isInitialized = true; // Mark as "processed" so we don't spam
            return;
        }
    } catch (err) {
        // If we can't even run 'hello', the connection is unstable. 
        // We will let the error event handlers handle recovery.
        logger.debug('ChangeStream: Capability check failed, will attempt opportunistic watch.', { error: err.message });
    }

    isInitialized = true;

    // 1. Watch NodueApproval
    try {
        const approvalStream = db.collection('nodueapprovals').watch([], { fullDocument: 'updateLookup' });

        approvalStream.on('change', (change) => {
            try {
                const { operationType, fullDocument } = change;
                if (operationType === 'update' || operationType === 'insert') {
                    const { studentId, facultyId, batchId, action } = fullDocument;
                    if (studentId) {
                        pushEvent([studentId.toString()], 'approval_update', { 
                            batchId: batchId?.toString(),
                            action 
                        });
                    }
                    if (facultyId) {
                        pushEvent([facultyId.toString()], 'pending_list_update', { 
                            batchId: batchId?.toString() 
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

    // 2. Watch NodueRequest
    try {
        const requestStream = db.collection('noduerequests').watch([], { fullDocument: 'updateLookup' });
        requestStream.on('change', (change) => {
            try {
                const { operationType, fullDocument } = change;
                if (operationType === 'update' || operationType === 'insert') {
                    const { studentId, batchId, status } = fullDocument;
                    if (studentId) {
                        pushEvent([studentId.toString()], 'request_status_change', { 
                            batchId: batchId?.toString(),
                            status 
                        });
                    }
                }
            } catch (err) {
                logger.error('change_stream_request_process_error', { error: err.message });
            }
        });

        requestStream.on('error', (err) => {
            if (!err.message.includes('changeStream')) {
                logger.error('request_change_stream_error', { error: err.message });
            }
        });

        logger.info('MongoDB Change Stream: NodueRequest watcher active.');
    } catch (err) {
        if (!err.message.includes('changeStream')) {
            logger.warn('MongoDB Change Stream: NodueRequest watcher could not be started.', { error: err.message });
        }
    }

    logger.info('MongoDB Change Streams initialized.');
};
