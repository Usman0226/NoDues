import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Models
import Student from '../src/models/Student.js';
import Faculty from '../src/models/Faculty.js';
import Class from '../src/models/Class.js';
import Department from '../src/models/Department.js';
import Subject from '../src/models/Subject.js';
import NodueBatch from '../src/models/NodueBatch.js';
import NodueRequest from '../src/models/NodueRequest.js';
import NodueApproval from '../src/models/NodueApproval.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const checkStatus = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not found');

    await mongoose.connect(uri);
    console.log('--- System Status Report ---');

    const [
      studentCount,
      facultyCount,
      classCount,
      deptCount,
      subjectCount,
      batchCount,
      requestCount,
      approvalCount,
      activeBatches
    ] = await Promise.all([
      Student.countDocuments(),
      Faculty.countDocuments(),
      Class.countDocuments(),
      Department.countDocuments(),
      Subject.countDocuments(),
      NodueBatch.countDocuments(),
      NodueRequest.countDocuments(),
      NodueApproval.countDocuments(),
      NodueBatch.find({ status: 'active' }).select('className semester academicYear').lean()
    ]);

    console.log(`Departments: ${deptCount}`);
    console.log(`Classes:     ${classCount}`);
    console.log(`Subjects:    ${subjectCount}`);
    console.log(`Faculty:     ${facultyCount}`);
    console.log(`Students:    ${studentCount}`);
    console.log(`Batches:     ${batchCount} (Active: ${activeBatches.length})`);
    console.log(`Requests:    ${requestCount}`);
    console.log(`Approvals:   ${approvalCount}`);

    if (activeBatches.length > 0) {
      console.log('\nActive Batches:');
      activeBatches.forEach(b => {
        console.log(`- ${b.className} (Sem ${b.semester}, ${b.academicYear})`);
      });
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
};

checkStatus();
