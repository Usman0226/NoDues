import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './src/models/Student.js';
import NodueApproval from './src/models/NodueApproval.js';
import CoCurricularType from './src/models/CoCurricularType.js';
import NodueBatch from './src/models/NodueBatch.js';
import Class from './src/models/Class.js';

dotenv.config();

async function inspectStudents() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const rollNo1 = '23691A3219';
    const rollNo2 = '23691A3222';

    const s1 = await Student.findOne({ rollNo: rollNo1 }).lean();
    const s2 = await Student.findOne({ rollNo: rollNo2 }).lean();

    if (!s1 || !s2) {
      console.log('One or both students not found');
      process.exit(1);
    }

    // Find active batches for their classes
    const b1 = await NodueBatch.findOne({ classId: s1.classId, status: 'active' }).lean();
    const b2 = await NodueBatch.findOne({ classId: s2.classId, status: 'active' }).lean();

    console.log(`\n--- Student 1: ${rollNo1} ---`);
    console.log(`Name: ${s1.name}`);
    console.log(`ClassID: ${s1.classId}`);
    console.log(`Active Batch: ${b1?.academicYear} (ID: ${b1?._id})`);
    console.log(`Mentor: ${s1.mentorId}`);

    console.log(`\n--- Student 2: ${rollNo2} ---`);
    console.log(`Name: ${s2.name}`);
    console.log(`ClassID: ${s2.classId}`);
    console.log(`Active Batch: ${b2?.academicYear} (ID: ${b2?._id})`);
    console.log(`Mentor: ${s2.mentorId}`);

    const a1 = await NodueApproval.find({ studentRollNo: rollNo1 }).lean();
    const a2 = await NodueApproval.find({ studentRollNo: rollNo2 }).lean();

    console.log(`\nApprovals for ${rollNo1} (${a1.length}):`);
    a1.forEach(a => console.log(`- Type: ${a.approvalType} | Role: ${a.roleTag} | Item: ${a.itemTypeName} | Faculty: ${a.facultyId} | Status: ${a.action}`));

    console.log(`\nApprovals for ${rollNo2} (${a2.length}):`);
    a2.forEach(a => console.log(`- Type: ${a.approvalType} | Role: ${a.roleTag} | Item: ${a.itemTypeName} | Faculty: ${a.facultyId} | Status: ${a.action}`));

    // Check Co-Curricular difference
    const types2 = a2.filter(a => a.approvalType === 'coCurricular').map(a => a.itemTypeName);
    const types1 = a1.filter(a => a.approvalType === 'coCurricular').map(a => a.itemTypeName);
    
    const missingIn1 = types2.filter(t => !types1.includes(t));
    console.log(`\nMissing Co-Curriculars in ${rollNo1}:`, missingIn1);

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

inspectStudents();
