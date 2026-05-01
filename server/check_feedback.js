import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Feedback from './src/models/Feedback.js';

dotenv.config();

async function checkFeedback() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const count = await Feedback.countDocuments();
    console.log(`Total feedback count: ${count}`);
    
    const feedback = await Feedback.find().limit(5).lean();
    console.log('Sample feedback:', JSON.stringify(feedback, null, 2));
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkFeedback();
