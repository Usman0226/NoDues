import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './src/models/Student.js';
import NodueApproval from './src/models/NodueApproval.js';
import CoCurricularType from './src/models/CoCurricularType.js';
import NodueBatch from './src/models/NodueBatch.js';

dotenv.config();

async function inspectStudents() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const rollNo1 = '23691A3219';
    const rollNo2 = '23691A3222';

    const s1 = await Student.findOne({ rollNo: rollNo1 }).populate('batchId').lean();
    const s2 = await Student.findOne({ rollNo: rollNo2 }).populate('batchId').lean();

    if (!s1 || !s2) {
      console.log('One or both students not found');
      process.exit(1);
    }

    console.log(`\n--- Student 1: ${rollNo1} ---`);
    console.log(`Name: ${s1.name}`);
    console.log(`Batch: ${s1.batchId?.name} (ID: ${s1.batchId?._id})`);
    console.log(`Mentor: ${s1.mentorId}`);

    console.log(`\n--- Student 2: ${rollNo2} ---`);
    console.log(`Name: ${s2.name}`);
    console.log(`Batch: ${s2.batchId?.name} (ID: ${s2.batchId?._id})`);
    console.log(`Mentor: ${s2.mentorId}`);

    const a1 = await NodueApproval.find({ studentRollNo: rollNo1 }).lean();
    const a2 = await NodueApproval.find({ studentRollNo: rollNo2 }).lean();

    console.log(`\nApprovals for ${rollNo1} (${a1.length}):`);
    a1.forEach(a => console.log(`- Type: ${a.approvalType} | Role: ${a.roleTag} | Item: ${a.itemTypeName} | Faculty: ${a.facultyId} | Status: ${a.action}`));

    console.log(`\nApprovals for ${rollNo2} (${a2.length}):`);
    a2.forEach(a => console.log(`- Type: ${a.approvalType} | Role: ${a.roleTag} | Item: ${a.itemTypeName} | Faculty: ${a.facultyId} | Status: ${a.action}`));

    // Find difference
    const types2 = a2.filter(a => a.approvalType === 'coCurricular').map(a => a.itemTypeName);
    const types1 = a1.filter(a => a.approvalType === 'coCurricular').map(a => a.itemTypeName);
    
    const missingIn1 = types2.filter(t => !types1.includes(t));
    console.log(`\nMissing Co-Curriculars in ${rollNo1}:`, missingIn1);

    // If missing, let's see why. Maybe batch configuration?
    if (s1.batchId) {
        const batch = await NodueBatch.findById(s1.batchId._id).lean();
        console.log(`\nBatch Configuration for ${batch.name}:`);
        console.log(`Co-Curriculars Enabled: ${JSON.stringify(batch.coCurricularItems?.map(i => i.itemTypeId))}`);
    }

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

inspectStudents();
