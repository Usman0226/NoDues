import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './server/.env' });

import Class from '../server/src/models/Class.js';
import Student from '../server/src/models/Student.js';

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const cls = await Class.findOne({ isActive: true });
    if (!cls) {
      console.log('No active class found');
      return;
    }

    console.log(`Checking Class: ${cls.name} (${cls._id})`);

    // Simulate the new logic
    const students = await Student.find({ classId: cls._id, isActive: true })
      .populate('mentorId', 'name')
      .sort({ rollNo: 1 })
      .lean();

    console.log(`Total students found directly: ${students.length}`);
    
    const sample = students.slice(0, 5).map(s => ({
      rollNo: s.rollNo,
      mentor: s.mentorId ? (s.mentorId.name || 'ID Only') : 'Not Assigned'
    }));

    console.table(sample);

    const missingMentors = students.filter(s => !s.mentorId).length;
    console.log(`Students without mentors: ${missingMentors}`);

  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

check();
