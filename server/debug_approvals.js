import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Faculty from './src/models/Faculty.js';
import NodueBatch from './src/models/NodueBatch.js';
import NodueApproval from './src/models/NodueApproval.js';

dotenv.config();

async function debugState() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const faculty = await Faculty.findOne({ name: 'Test Faculty -2' }).lean();
  if (!faculty) {
    console.log('Faculty "Test Faculty -2" not found');
    process.exit(1);
  }

  console.log(`Faculty ID: ${faculty._id}`);
  console.log(`Role Tags: ${faculty.roleTags}`);
  console.log(`Department ID: ${faculty.departmentId}`);

  const activeBatches = await NodueBatch.find({ status: 'active' }).lean();
  console.log(`Total active batches: ${activeBatches.length}`);

  const myDeptBatches = activeBatches.filter(b => b.departmentId && b.departmentId.toString() === faculty.departmentId?.toString());
  console.log(`Department batches found: ${myDeptBatches.length}`);
  myDeptBatches.forEach(b => {
    console.log(` - Batch: ${b.className} (ID: ${b._id})`);
  });

  const batchIds = myDeptBatches.map(b => b._id);
  
  const approvalCounts = await NodueApproval.aggregate([
    { $match: { batchId: { $in: batchIds } } },
    { $group: { _id: '$approvalType', count: { $sum: 1 }, action: { $first: '$action' } } }
  ]);

  console.log('Approval types in these batches:');
  approvalCounts.forEach(c => {
    console.log(` - ${c._id}: ${c.count} records (Example action: ${c.action})`);
  });

  const assignedToMe = await NodueApproval.countDocuments({ facultyId: faculty._id, action: 'pending' });
  console.log(`Pending approvals explicitly assigned to me: ${assignedToMe}`);

  process.exit(0);
}

debugState().catch(err => {
  console.error(err);
  process.exit(1);
});
