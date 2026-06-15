import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CoCurricularType from './src/models/CoCurricularType.js';

dotenv.config();

const findAO = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    const types = await CoCurricularType.find({});
    console.log('CoCurricularTypes:', JSON.stringify(types, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

findAO();
