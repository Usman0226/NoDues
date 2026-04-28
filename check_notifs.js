import mongoose from 'mongoose';
import Notification from './server/src/models/Notification.js';
import dotenv from 'dotenv';

dotenv.config({ path: './server/.env' });

async function check() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in environment');
    process.exit(1);
  }
  
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
  
  const count = await Notification.countDocuments({});
  console.log('Total Notifications:', count);
  
  const adminNotifs = await Notification.find({ userModel: 'Admin' });
  console.log('Admin Notifications:', adminNotifs.length);
  
  const facultyNotifs = await Notification.find({ userModel: 'Faculty' });
  console.log('Faculty Notifications:', facultyNotifs.length);

  const studentNotifs = await Notification.find({ userModel: 'Student' });
  console.log('Student Notifications:', studentNotifs.length);
  
  if (adminNotifs.length > 0) {
    console.log('Sample Admin Notif:', adminNotifs[0]);
  }
  
  process.exit(0);
}

check();
