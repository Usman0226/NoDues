import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './src/models/Student.js';
import NodueApproval from './src/models/NodueApproval.js';
import CoCurricularType from './src/models/CoCurricularType.js';

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

    console.log(`Student 1 (${rollNo1}) ID: ${s1._id}`);
    console.log(`Student 2 (${rollNo2}) ID: ${s2._id}`);

    const a1 = await NodueApproval.find({ studentRollNo: rollNo1 }).lean();
    const a2 = await NodueApproval.find({ studentRollNo: rollNo2 }).lean();

    console.log(`\nApprovals for ${rollNo1}:`);
    a1.forEach(a => console.log(`- ${a.category} | ${a.name} | roleTag: ${a.roleTag} | status: ${a.status}`));

    console.log(`\nApprovals for ${rollNo2}:`);
    a2.forEach(a => console.log(`- ${a.category} | ${a.name} | roleTag: ${a.roleTag} | status: ${a.status}`));

    // Check co-curricular types
    const types = await CoCurricularType.find({ isActive: true }).lean();
    console.log('\nActive Co-Curricular Types:');
    types.forEach(t => console.log(`- ${t.name} | tag: ${t.roleTag} | faculty: ${t.facultyId}`));

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

inspectStudents();
