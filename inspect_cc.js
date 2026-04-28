import mongoose from 'mongoose';
import NodueApproval from './server/src/models/NodueApproval.js';
import dotenv from 'dotenv';

dotenv.config({ path: './server/.env' });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const ccApprovals = await NodueApproval.find({ approvalType: 'coCurricular' }).limit(10).lean();
    console.log(JSON.stringify(ccApprovals, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
