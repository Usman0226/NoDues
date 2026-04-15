import mongoose from 'mongoose';
import { pushEvent } from '../Controllers/sseController.js';
import logger from './logger.js';

/**
 * Initializes MongoDB Change Streams to synchronize SSE events across multiple server instances.
 * This ensures that a database update on Instance A triggers an SSE notification 
 * on Instance B, C, etc.
 */
export const initChangeStreams = () => {
    const db = mongoose.connection;

    // 1. Watch NodueApproval (Most frequent updates - student dashboard sync)
    try {
        const approvalStream = db.collection('nodueapprovals').watch([], { fullDocument: 'updateLookup' });

        approvalStream.on('change', (change) => {
            try {
                const { operationType, fullDocument } = change;

                if (operationType === 'update' || operationType === 'insert') {
                    const { studentId, facultyId, batchId, action } = fullDocument;
                    
                    // Notify Student
                    if (studentId) {
                        pushEvent([studentId.toString()], 'approval_update', { 
                            batchId: batchId?.toString(),
                            action 
                        });
                    }

                    // Notify Faculty (if they need live UI updates for their pending list)
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
            logger.error('approval_change_stream_error', { error: err.message });
            // Attempt recovery after a delay if not a Capability error
            if (!err.message.includes('ChangeStream') && !err.message.includes('ReplicaSet')) {
                setTimeout(initChangeStreams, 10000);
            }
        });

        logger.info('MongoDB Change Stream: NodueApproval watcher active.');
    } catch (err) {
        logger.warn('MongoDB Change Stream: NodueApproval watcher could not be started (Replica Set required).', { error: err.message });
    }

    // 2. Watch NodueRequest (Batch level status changes)
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
            logger.error('request_change_stream_error', { error: err.message });
        });

        logger.info('MongoDB Change Stream: NodueRequest watcher active.');
    } catch (err) {
        logger.warn('MongoDB Change Stream: NodueRequest watcher could not be started.', { error: err.message });
    }

    logger.info('MongoDB Change Streams initialized for real-time SSE synchronization.');
};
