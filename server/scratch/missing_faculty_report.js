import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Models
import Student from '../src/models/Student.js';
import Faculty from '../src/models/Faculty.js';
import Class from '../src/models/Class.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const listMissingFaculty = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not found');

    await mongoose.connect(uri);
    console.log('--- MISSING FACULTY ASSIGNMENT REPORT ---\n');

    const classes = await Class.find({ isActive: true }).lean();
    let totalIssues = 0;

    for (const cls of classes) {
      const missingSubjects = (cls.subjectAssignments || []).filter(sa => !sa.facultyId);
      
      if (missingSubjects.length > 0) {
        const activeStudentCount = await Student.countDocuments({ classId: cls._id, isActive: true });
        
        console.log(`Class: ${cls.name} (${activeStudentCount} active students)`);
        missingSubjects.forEach(sa => {
          console.log(`  - ❌ Subject: "${sa.subjectName}" (${sa.subjectCode || 'No Code'}) -> Faculty: NOT ASSIGNED`);
        });
        console.log('');
        totalIssues += missingSubjects.length;
      }
    }

    if (totalIssues === 0) {
      console.log(' All active classes have faculty assigned to all subjects.');
    } else {
      console.log(`Found ${totalIssues} missing faculty assignments across ${classes.length} classes.`);
      console.log('IMPORTANT: You must assign faculty to these subjects before starting a NoDues batch.');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Report Error:', err.message);
    process.exit(1);
  }
};

listMissingFaculty();
