import mongoose from 'mongoose';
import dotenv from 'dotenv';
import NodueRequest from './src/models/NodueRequest.js';
import NodueApproval from './src/models/NodueApproval.js';

dotenv.config();

const countAO = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    // Find requests with "ao" in facultySnapshot
    const requestsWithAO = await NodueRequest.countDocuments({ "facultySnapshot.ao": { $exists: true } });
    console.log('NodueRequests with "ao" snapshot:', requestsWithAO);
    
    // Find approvals with roleTag "ao"
    const approvalsWithAO = await NodueApproval.countDocuments({ roleTag: 'ao' });
    console.log('NodueApprovals with roleTag "ao":', approvalsWithAO);

    // Find any approval with subjectName "Department Clearance (AO)"
    const approvalsByName = await NodueApproval.countDocuments({ subjectName: /Department Clearance \(AO\)/i });
    console.log('NodueApprovals with name "Department Clearance (AO)":', approvalsByName);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

countAO();
