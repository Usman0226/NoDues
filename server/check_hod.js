import mongoose from 'mongoose';
import dotenv from 'dotenv';
import NodueApproval from './src/models/NodueApproval.js';

dotenv.config();

const checkHOD = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    const countHOD = await NodueApproval.countDocuments({ roleTag: 'hod' });
    console.log('NodueApprovals with roleTag "hod":', countHOD);

    const hodNames = await NodueApproval.distinct('subjectName', { roleTag: 'hod' });
    console.log('Subject names for roleTag "hod":', hodNames);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

checkHOD();
