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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const auditData = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not found');

    await mongoose.connect(uri);
    console.log('--- Data Inconsistency Audit ---\n');

    const issues = [];

    // 1. Check Classes with NO Students
    const classes = await Class.find({}).lean();
    for (const cls of classes) {
      const studentCount = await Student.countDocuments({ classId: cls._id });
      if (studentCount === 0) {
        issues.push(`[MAJOR] Class "${cls.name}" has ZERO students assigned.`);
      } else if (cls.studentIds.length !== studentCount) {
        issues.push(`[MINOR] Class "${cls.name}" studentIds array (${cls.studentIds.length}) doesn't match actual student count (${studentCount}).`);
      }
    }

    // 2. Check Classes with NO Subject Assignments
    for (const cls of classes) {
      if (!cls.subjectAssignments || cls.subjectAssignments.length === 0) {
        issues.push(`[CRITICAL] Class "${cls.name}" has NO subject assignments. Initiation will fail for this class.`);
      }
    }

    // 3. Check for Orphaned Students (No Class or Invalid Class)
    const orphans = await Student.find({
      $or: [
        { classId: { $exists: false } },
        { classId: null }
      ]
    }).lean();
    if (orphans.length > 0) {
      issues.push(`[CRITICAL] Found ${orphans.length} students with NO Class assigned.`);
    }

    // 4. Check Subject Assignments for Invalid Faculty
    for (const cls of classes) {
      for (const sa of (cls.subjectAssignments || [])) {
        const facultyExists = await Faculty.exists({ _id: sa.facultyId });
        if (!facultyExists) {
          issues.push(`[MAJOR] Class "${cls.name}" has subject "${sa.subjectName}" assigned to non-existent Faculty ID ${sa.facultyId}.`);
        }
      }
    }

    // 5. Check Departments with NO Classes
    const depts = await Department.find({}).lean();
    for (const dept of depts) {
      const classInDept = await Class.exists({ departmentId: dept._id });
      if (!classInDept) {
        issues.push(`[MINOR] Department "${dept.name}" has NO classes.`);
      }
    }

    if (issues.length === 0) {
      console.log('✅ No structural inconsistencies found. Data integrity is solid.');
    } else {
      console.log('❌ Found the following inconsistencies:');
      issues.forEach(i => console.log(`  - ${i}`));
    }

    console.log('\n--- Audit Complete ---');
    await mongoose.disconnect();
  } catch (err) {
    console.error('Audit Error:', err.message);
    process.exit(1);
  }
};

auditData();
