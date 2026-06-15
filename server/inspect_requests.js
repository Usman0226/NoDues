import mongoose from 'mongoose';
import dotenv from 'dotenv';
import NodueRequest from './src/models/NodueRequest.js';

dotenv.config();

const inspectRequests = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    const requests = await NodueRequest.find({}).limit(5).lean();
    console.log('Sample Requests:', JSON.stringify(requests, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

inspectRequests();
