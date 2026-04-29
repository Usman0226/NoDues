import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './src/models/Student.js';
import NodueRequest from './src/models/NodueRequest.js';

dotenv.config();

async function fixSnapshots() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const targetRollNo = '23691A3219';
    const refRollNo = '23691A3222';

    const s1 = await Student.findOne({ rollNo: targetRollNo }).lean();
    const s2 = await Student.findOne({ rollNo: refRollNo }).lean();

    if (!s1 || !s2) {
      console.log('Students not found');
      process.exit(1);
    }

    const r1 = await NodueRequest.findOne({ studentId: s1._id });
    const r2 = await NodueRequest.findOne({ studentId: s2._id });

    if (!r1 || !r2) {
      console.log('Requests not found');
      process.exit(1);
    }

    // Merge missing keys from ref snapshot to target snapshot
    const snap1 = r1.facultySnapshot || {};
    const snap2 = r2.facultySnapshot || {};

    const keysToCopy = ['mentor', '69e186bf9c69094df537292c', '69e18fcfe3cc50aa2c5b0b80', '69f06e2e3d824a5a3041c436'];
    let changed = false;

    for (const key of keysToCopy) {
      if (!snap1[key] && snap2[key]) {
        snap1[key] = snap2[key];
        changed = true;
        console.log(`Copied snapshot key: ${key}`);
      }
    }

    if (changed) {
      r1.facultySnapshot = snap1;
      r1.markModified('facultySnapshot');
      await r1.save();
      console.log('Faculty snapshot updated for 23691A3219');
    } else {
      console.log('No snapshot changes needed (keys already exist?)');
    }

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

fixSnapshots();
