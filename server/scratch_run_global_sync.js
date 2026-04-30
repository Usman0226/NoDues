import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { syncAllActiveBatches } from './src/utils/batchSync.js';

dotenv.config();

async function runSync() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('Starting global batch sync...');
    await syncAllActiveBatches();
    console.log('Global batch sync completed.');

    process.exit(0);
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

runSync();
