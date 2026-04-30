import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Schemas
const NodueRequestSchema = new mongoose.Schema({}, { strict: false });
const NodueRequest = mongoose.model('NodueRequest', NodueRequestSchema, 'noduerequests');

const StudentSchema = new mongoose.Schema({}, { strict: false });
const Student = mongoose.model('Student', StudentSchema, 'students');

async function checkStudent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const student = await Student.findOne({ rollNo: '23691A04D3' });
    if (!student) {
      console.log('Student not found');
      process.exit(0);
    }
    
    console.log('Student ID:', student._id);
    
    const request = await NodueRequest.findOne({ studentId: student._id });
    if (request) {
      console.log('NodueRequest found:', request._id);
      console.log('Status:', request.status);
    } else {
      console.log('NodueRequest still missing');
    }

    process.exit(0);
  } catch (error) {
    console.error('Check failed:', error);
    process.exit(1);
  }
}

checkStudent();
