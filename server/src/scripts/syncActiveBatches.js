import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/db.js';
import { syncAllActiveBatches } from '../utils/batchSync.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function run() {
  try {
    console.log('🚀 Starting Active Batch Synchronization...');
    await connectDB();
    
    await syncAllActiveBatches();
    
    console.log('Synchronization complete. Check server logs for details.');
    process.exit(0);
  } catch (err) {
    console.error(' Synchronization failed:', err);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }
}

run();
