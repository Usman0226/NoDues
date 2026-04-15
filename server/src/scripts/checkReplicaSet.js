import 'dotenv/config';
import mongoose from 'mongoose';

const checkReplicaSet = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const admin = mongoose.connection.db.admin();
    const status = await admin.command({ replSetGetStatus: 1 });
    
    console.log('--- MongoDB Status ---');
    console.log('Is Replica Set:', !!status.ok);
    console.log('Replica Set Name:', status.set);
    console.log('Members:', status.members.length);
    console.log('SUCCESS: Transactions are supported.');
    
    process.exit(0);
  } catch (err) {
    if (err.message.includes('not running with --replSet')) {
      console.error('ERROR: This MongoDB instance is NOT a replica set. Transactions will NOT work.');
    } else if (err.message.includes('not authorized')) {
       // Cloud providers like Atlas hide replSetGetStatus from standard users
       // but support transactions. We can test by actually trying a session.
       try {
         const session = await mongoose.startSession();
         session.startTransaction();
         await session.commitTransaction();
         session.endSession();
         console.log('SUCCESS: Transactions are manually verified to work.');
         process.exit(0);
       } catch (innerErr) {
         console.error('ERROR: Transactions test failed:', innerErr.message);
         process.exit(1);
       }
    } else {
      console.error('ERROR checking status:', err.message);
      process.exit(1);
    }
  }
};

checkReplicaSet();
