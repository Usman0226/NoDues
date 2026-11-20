import mongoose from 'mongoose';

const uri = 'mongodb+srv://projectsclgmits_db_user:sHx7HKaoq7nqnE5K@cluster0.lgbf0fe.mongodb.net/test?appName=Cluster0';

async function testHistoryIndex() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const sampleFaculty = await db.collection('faculties').findOne({ isActive: true });

  console.log('Testing index: { facultyId: 1, actionedAt: -1, action: 1 }...');
  await db.collection('nodueapprovals').createIndex(
    { facultyId: 1, actionedAt: -1, action: 1 },
    { background: true, name: 'facultyId_1_actionedAt_-1_action_1' }
  );

  const h = db.collection('nodueapprovals').find({
    facultyId: sampleFaculty._id,
    action: { $nin: ['pending', 'not_submitted'] }
  }).sort({ actionedAt: -1 }).limit(20);

  const exp = await h.explain('executionStats');
  console.log('Stage with { facultyId: 1, actionedAt: -1, action: 1 }:', exp.executionStats.executionStages.stage);
  console.log('Input Stage:', exp.executionStats.executionStages.inputStage?.stage);

  await mongoose.disconnect();
}
testHistoryIndex().catch(console.error);
