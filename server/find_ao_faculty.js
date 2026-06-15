import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Faculty from './src/models/Faculty.js';

dotenv.config();

const findAOFaculty = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    const faculty = await Faculty.find({ role: 'ao' });
    console.log('Faculty with role AO:', JSON.stringify(faculty, null, 2));
    
    const facultyByName = await Faculty.find({ name: /AO/i });
    console.log('Faculty with name AO:', JSON.stringify(facultyByName, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

findAOFaculty();
