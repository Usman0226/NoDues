import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function findAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = mongoose.model('Admin', new mongoose.Schema({}), 'admins'); // Try admins collection
    const admin = await User.findOne().lean();
    console.log('Admin:', JSON.stringify(admin, null, 2));
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

findAdmin();
