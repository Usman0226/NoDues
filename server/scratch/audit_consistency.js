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
    await mongoose.connect(uri);
    console.log('--- Data Consistency Audit ---\n');

    // 1. Check for students with missing or invalid Class/Dept
    const [students, classes, departments, faculty, subjects] = await Promise.all([
      Student.find({}, 'classId departmentId').lean(),
      Class.find({}, '_id departmentId classTeacherId subjectAssignments').lean(),
      Department.find({}, '_id').lean(),
      Faculty.find({}, '_id').lean(),
      Subject.find({}, '_id').lean()
    ]);

    const classIds = new Set(classes.map(c => c._id.toString()));
    const deptIds = new Set(departments.map(d => d._id.toString()));
    const facultyIds = new Set(faculty.map(f => f._id.toString()));
    const subjectIds = new Set(subjects.map(s => s._id.toString()));

    let issues = 0;

    // Student Validation
    students.forEach(s => {
      if (!s.classId || !classIds.has(s.classId.toString())) {
        console.warn(`[Student Issue] Student ${s._id} has invalid/missing classId: ${s.classId}`);
        issues++;
      }
      if (!s.departmentId || !deptIds.has(s.departmentId.toString())) {
        console.warn(`[Student Issue] Student ${s._id} has invalid/missing departmentId: ${s.departmentId}`);
        issues++;
      }
    });

    // Class Validation
    classes.forEach(c => {
      if (!c.departmentId || !deptIds.has(c.departmentId.toString())) {
        console.warn(`[Class Issue] Class ${c._id} has invalid departmentId: ${c.departmentId}`);
        issues++;
      }
      if (c.classTeacherId && !facultyIds.has(c.classTeacherId.toString())) {
        console.warn(`[Class Issue] Class ${c._id} has invalid classTeacherId: ${c.classTeacherId}`);
        issues++;
      }
      if (!c.subjectAssignments || c.subjectAssignments.length === 0) {
        console.warn(`[Class Warning] Class ${c._id} ("${c.name || 'Unknown'}") has NO subjects assigned.`);
      } else {
        c.subjectAssignments.forEach(sa => {
          if (!sa.subjectId || !subjectIds.has(sa.subjectId.toString())) {
            console.warn(`[Class Issue] Class ${c._id} has invalid subjectId in assignments: ${sa.subjectId}`);
            issues++;
          }
          if (sa.facultyId && !facultyIds.has(sa.facultyId.toString())) {
            console.warn(`[Class Issue] Class ${c._id} has invalid facultyId for subject ${sa.subjectName}: ${sa.facultyId}`);
            issues++;
          }
        });
      }
    });

    console.log(`\nAudit Complete. Total Critical Issues Found: ${issues}`);
    if (issues === 0) console.log('✅ DATA IS CONSISTENT.');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Audit failed:', err.message);
    process.exit(1);
  }
};

auditData();
