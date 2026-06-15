import mongoose from 'mongoose';
import dotenv from 'dotenv';
import NodueRequest from './src/models/NodueRequest.js';
import NodueApproval from './src/models/NodueApproval.js';
import { bulkRecalcRequestStatus } from './src/Controllers/approvalController.js';

dotenv.config();

const performAOCleanup = async () => {
  let session;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    session = await mongoose.startSession();
    await session.startTransaction();
    console.log('Transaction started');

    // 1. Find all requests that have the "ao" key in facultySnapshot
    const affectedRequests = await NodueRequest.find(
      { "facultySnapshot.ao": { $exists: true } },
      { _id: 1 }
    ).session(session).lean();

    const requestIds = affectedRequests.map(r => r._id);
    console.log(`Found ${requestIds.length} requests with "ao" snapshot entry.`);

    if (requestIds.length > 0) {
      // 2. Remove the "ao" key from facultySnapshot in NodueRequests
      const requestResult = await NodueRequest.updateMany(
        { _id: { $in: requestIds } },
        { $unset: { "facultySnapshot.ao": "" } },
        { session }
      );
      console.log(`Successfully updated ${requestResult.modifiedCount} NodueRequest documents.`);

      // 3. Delete the NodueApproval records with roleTag "ao"
      const approvalResult = await NodueApproval.deleteMany(
        { roleTag: 'ao' },
        { session }
      );
      console.log(`Successfully deleted ${approvalResult.deletedCount} NodueApproval records.`);

      // 4. Recalculate status for affected requests
      console.log('Recalculating request statuses...');
      await bulkRecalcRequestStatus(requestIds, session);
      console.log('Status recalculation completed.');
    } else {
      console.log('No "ao" records found to clean up.');
    }

    await session.commitTransaction();
    console.log('Transaction committed successfully.');
    
    process.exit(0);
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Cleanup failed:', err);
    process.exit(1);
  } finally {
    if (session) session.endSession();
  }
};

performAOCleanup();
