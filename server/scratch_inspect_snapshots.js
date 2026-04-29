import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './src/models/Student.js';
import NodueRequest from './src/models/NodueRequest.js';

dotenv.config();

async function inspectSnapshots() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const roll1 = '23691A3219';
    const roll2 = '23691A3222';

    const s1 = await Student.findOne({ rollNo: roll1 }).lean();
    const s2 = await Student.findOne({ rollNo: roll2 }).lean();

    const r1 = await NodueRequest.findOne({ studentId: s1._id }).lean();
    const r2 = await NodueRequest.findOne({ studentId: s2._id }).lean();

    console.log(`\n--- Faculty Snapshot for ${roll1} ---`);
    console.log(JSON.stringify(r1.facultySnapshot, null, 2));

    console.log(`\n--- Faculty Snapshot for ${roll2} ---`);
    console.log(JSON.stringify(r2.facultySnapshot, null, 2));

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

inspectSnapshots();
