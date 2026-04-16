import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: './server/.env' });

// Mock cache hooks to allow importing models
process.env.NODE_ENV = 'test'; 

import Class from '../server/src/models/Class.js';
import Student from '../server/src/models/Student.js';
import Faculty from '../server/src/models/Faculty.js';

async function diagnose() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const cls = await Class.findOne({ isActive: true });
    if (!cls) {
      console.log('No active class found');
      return;
    }

    console.log(`Diagnosing Class: ${cls.name} (${cls._id})`);
    console.log(`StudentIds array length: ${cls.studentIds.length}`);

    const populatedClass = await Class.findById(cls._id)
      .populate({
        path: 'studentIds',
        populate: { path: 'mentorId', select: 'name' }
      })
      .lean();

    const students = populatedClass.studentIds.filter(s => !!s);
    console.log(`Populated students length: ${students.length}`);

    const withMentors = students.filter(s => s.mentorId);
    console.log(`Students with mentors (populated): ${withMentors.length}`);

    if (withMentors.length > 0) {
      console.log('Sample student with mentor:', JSON.stringify({
        rollNo: withMentors[0].rollNo,
        mentor: withMentors[0].mentorId
      }, null, 2));
    } else {
      console.log('Searching Student collection directly...');
      const studentsDirect = await Student.find({ classId: cls._id, mentorId: { $ne: null } }).limit(5).lean();
      console.log(`Found ${studentsDirect.length} students with mentors directly in Student collection.`);
      if (studentsDirect.length > 0) {
        console.log('Mentors exist in Student collection but NOT in Class.studentIds population!');
        console.log('Check if studentIds array contains these students.');
        const studentIdStrings = cls.studentIds.map(id => id.toString());
        const missingInArray = studentsDirect.filter(s => !studentIdStrings.includes(s._id.toString()));
        console.log(`${missingInArray.length} students are missing from Class.studentIds array.`);
      }
    }

  } catch (err) {
    console.error('Diagnosis failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

diagnose();
