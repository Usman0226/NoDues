import mongoose from 'mongoose';
import dotenv from 'dotenv';
import NodueApproval from './src/models/NodueApproval.js';

dotenv.config();

const checkOtherAO = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    const tags = await NodueApproval.distinct('roleTag');
    console.log('All unique roleTags:', tags);
    
    const types = await NodueApproval.distinct('approvalType');
    console.log('All unique approvalTypes:', types);

    const aoNames = await NodueApproval.distinct('subjectName', { roleTag: 'ao' });
    console.log('Subject names for roleTag "ao":', aoNames);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

checkOtherAO();
