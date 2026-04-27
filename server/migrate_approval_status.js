import mongoose from 'mongoose';
import dotenv from 'dotenv';
import NodueApproval from './src/models/NodueApproval.js';

dotenv.config();

async function migrateStatuses() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const typesToUpdate = ['hodApproval', 'mentor', 'classTeacher', 'subject'];
  
  console.log('Starting migration for types:', typesToUpdate);

  const result = await NodueApproval.updateMany(
    { 
      approvalType: { $in: typesToUpdate },
      action: 'not_submitted'
    },
    { 
      $set: { action: 'pending' } 
    }
  );

  console.log(`Migration complete. Updated ${result.modifiedCount} records.`);
  process.exit(0);
}

migrateStatuses().catch(err => {
  console.error(err);
  process.exit(1);
});
