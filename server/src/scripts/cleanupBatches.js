import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Models
import NodueBatch from '../models/NodueBatch.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import Task from '../models/Task.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * CLEANUP SCRIPT: DELETES ALL INITIATED BATCHES AND RELATED DATA
 * This script will:
 * 1. Delete all NodueApproval records
 * 2. Delete all NodueRequest records
 * 3. Delete all NodueBatch records (both 'active' and 'closed')
 * 4. Delete related background Tasks (batch_initiation)
 * 
 * CORE DATA REMAINING: Students, Faculty, Classes, Departments, Subjects, Admin.
 */
const cleanupBatches = async () => {
  try {
    console.log('\n--- NoDues Batch Cleanup Script ---');
    console.log('WARNING: This will permanently delete all clearance batch history.');
    
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI not found in environment variables (check server/.env)');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected successfully.');

    // 1. Delete Approvals (lowest level)
    const approvalsResult = await NodueApproval.deleteMany({});
    console.log(`- Deleted ${approvalsResult.deletedCount} NodueApproval records.`);

    // 2. Delete Requests (middle level)
    const requestsResult = await NodueRequest.deleteMany({});
    console.log(`- Deleted ${requestsResult.deletedCount} NodueRequest records.`);

    // 3. Delete Batches (top level)
    const batchesResult = await NodueBatch.deleteMany({});
    console.log(`- Deleted ${batchesResult.deletedCount} NodueBatch records.`);

    // 4. Cleanup background tasks
    const tasksResult = await Task.deleteMany({ type: 'batch_initiation' });
    console.log(`- Deleted ${tasksResult.deletedCount} background initiation tasks.`);

    console.log('\nSUCCESS: All initiated batches and associated transactional data have been cleared.');
    console.log('You can now re-initiate NoDues for your classes as needed.');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\nCLEANUP FAILED:', error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
};

// Execute if run directly
cleanupBatches();
