import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import NodueBatch from './src/models/NodueBatch.js';
import NodueApproval from './src/models/NodueApproval.js';

dotenv.config();

const test = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Test NodueBatch enum
    const batch = new NodueBatch({
      classId: new mongoose.Types.ObjectId(),
      className: 'Test Class',
      departmentId: new mongoose.Types.ObjectId(),
      semester: 1,
      academicYear: '2023-24',
      initiatedBy: new mongoose.Types.ObjectId(),
      initiatedByRole: 'ao', // This should pass now
      status: 'active',
      totalStudents: 0
    });

    await batch.validate();
    console.log('NodueBatch validation passed for role "ao"');

    // Test NodueApproval enum
    const approval = new NodueApproval({
      requestId: new mongoose.Types.ObjectId(),
      batchId: new mongoose.Types.ObjectId(),
      studentId: new mongoose.Types.ObjectId(),
      facultyId: new mongoose.Types.ObjectId(),
      roleTag: 'ao' // This should pass now
    });

    await approval.validate();
    console.log('NodueApproval validation passed for roleTag "ao"');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Validation FAILED:', err.message);
    process.exit(1);
  }
};

test();
