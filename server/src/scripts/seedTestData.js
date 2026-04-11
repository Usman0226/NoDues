import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Faculty from '../models/Faculty.js';
import Student from '../models/Student.js';
import connectDB from '../config/db.js';
import logger from '../utils/logger.js';

const seedTestData = async () => {
  try {
    await connectDB();

    const deptId = '69da668ca036b8748d7025be'; // CSD
    const classId = '69da6ce1a036b8748d7025bf'; // Example Class

    // 1. Create HOD
    const hodData = {
      name: 'Test HOD',
      email: 'hod@test.com',
      password: 'Pass@123',
      employeeId: 'EMP001',
      role: 'hod',
      roleTags: ['hod'],
      departmentId: deptId,
      isActive: true,
      mustChangePassword: false
    };

    const existingHod = await Faculty.findOne({ email: hodData.email });
    if (!existingHod) {
      const hod = new Faculty(hodData);
      await hod.save();
      logger.info('Test HOD seeded');
    }

    // 2. Create Faculty
    const facultyData = {
      name: 'Test Faculty',
      email: 'faculty@test.com',
      password: 'Pass@123',
      employeeId: 'EMP002',
      role: 'faculty',
      roleTags: ['faculty'],
      departmentId: deptId,
      isActive: true,
      mustChangePassword: false
    };

    const existingFaculty = await Faculty.findOne({ email: facultyData.email });
    if (!existingFaculty) {
      const faculty = new Faculty(facultyData);
      await faculty.save();
      logger.info('Test Faculty seeded');
    }

    // 3. Create Student
    const studentData = {
      name: 'Test Student',
      rollNo: '22CS001',
      email: 'student@test.com',
      departmentId: deptId,
      classId: classId,
      isActive: true,
      semester: 4
    };

    const existingStudent = await Student.findOne({ rollNo: studentData.rollNo });
    if (!existingStudent) {
      const student = new Student(studentData);
      await student.save();
      logger.info('Test Student seeded');
    }

    logger.info('Seed process completed');
    process.exit(0);
  } catch (error) {
    logger.error('Seed failed', { error: error.message });
    process.exit(1);
  }
};

seedTestData();
