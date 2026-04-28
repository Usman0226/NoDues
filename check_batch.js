import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: './server/.env' });

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();

    const batchId = "69eb18f105c4cfc994d43df8";
    const batch = await db.collection('noduebatches').findOne({ _id: new ObjectId(batchId) });
    console.log('Batch info:', JSON.stringify(batch, null, 2));

    const activeBatches = await db.collection('noduebatches').find({ status: 'active' }).toArray();
    console.log('Active batches count:', activeBatches.length);
    console.log('Active batch IDs:', activeBatches.map(b => b._id.toString()));

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
    process.exit(0);
  }
}

run();