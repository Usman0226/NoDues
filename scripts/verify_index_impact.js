import mongoose from 'mongoose';

const uri = 'mongodb+srv://projectsclgmits_db_user:sHx7HKaoq7nqnE5K@cluster0.lgbf0fe.mongodb.net/test?appName=Cluster0';

async function verifyIndexImpact() {
  console.log('Connecting to Atlas...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  const sampleFaculty = await db.collection('faculties').findOne({ isActive: true });
  console.log(`Using sample faculty: ${sampleFaculty.name} (${sampleFaculty._id})`);

  // 1. Pending Approvals Query
  console.log('\n--- 1. Faculty Pending Approvals Query ---');
  const c1 = db.collection('nodueapprovals').find({
    facultyId: sampleFaculty._id,
    action: { $in: ['pending', 'not_submitted'] }
  }).sort({ studentRollNo: 1 }).limit(20);

  const exp1 = await c1.explain('executionStats');
  const stage1 = exp1.executionStats.executionStages.stage;
  console.log(`Stage before index: ${stage1}`);

  console.log('Ensuring index: { facultyId: 1, action: 1, studentRollNo: 1 }...');
  await db.collection('nodueapprovals').createIndex(
    { facultyId: 1, action: 1, studentRollNo: 1 },
    { background: true, name: 'facultyId_1_action_1_studentRollNo_1' }
  );

  const c2 = db.collection('nodueapprovals').find({
    facultyId: sampleFaculty._id,
    action: { $in: ['pending', 'not_submitted'] }
  }).sort({ studentRollNo: 1 }).limit(20);

  const exp2 = await c2.explain('executionStats');
  const stage2 = exp2.executionStats.executionStages.stage;
  const inputStage2 = exp2.executionStats.executionStages.inputStage?.stage;
  console.log(`Stage after index: ${stage2} (inputStage: ${inputStage2})`);
  console.log(`Sort in memory eliminated? ${stage1 === 'SORT' && stage2 !== 'SORT' ? 'YES! 🎯' : 'Check stages'}`);

  // 2. History Query
  console.log('\n--- 2. Faculty History Query ---');
  const h1 = db.collection('nodueapprovals').find({
    facultyId: sampleFaculty._id,
    action: { $nin: ['pending', 'not_submitted'] }
  }).sort({ actionedAt: -1 }).limit(20);

  const expH1 = await h1.explain('executionStats');
  console.log(`Stage before index: ${expH1.executionStats.executionStages.stage}`);

  console.log('Ensuring index: { facultyId: 1, action: 1, actionedAt: -1 }...');
  await db.collection('nodueapprovals').createIndex(
    { facultyId: 1, action: 1, actionedAt: -1 },
    { background: true, name: 'facultyId_1_action_1_actionedAt_-1' }
  );

  const h2 = db.collection('nodueapprovals').find({
    facultyId: sampleFaculty._id,
    action: { $nin: ['pending', 'not_submitted'] }
  }).sort({ actionedAt: -1 }).limit(20);

  const expH2 = await h2.explain('executionStats');
  const stageH2 = expH2.executionStats.executionStages.stage;
  const inputStageH2 = expH2.executionStats.executionStages.inputStage?.stage;
  console.log(`Stage after index: ${stageH2} (inputStage: ${inputStageH2})`);
  console.log(`Sort in memory eliminated? ${expH1.executionStats.executionStages.stage === 'SORT' && stageH2 !== 'SORT' ? 'YES! 🎯' : 'Check stages'}`);

  // 3. Mentee Query
  console.log('\n--- 3. Student Mentee Query ---');
  const m1 = db.collection('students').find({
    mentorId: sampleFaculty._id,
    isActive: true
  }).sort({ rollNo: 1 }).limit(100);

  const expM1 = await m1.explain('executionStats');
  console.log(`Stage before index: ${expM1.executionStats.executionStages.stage}`);

  console.log('Ensuring index: { mentorId: 1, isActive: 1, rollNo: 1 }...');
  await db.collection('students').createIndex(
    { mentorId: 1, isActive: 1, rollNo: 1 },
    { background: true, name: 'mentorId_1_isActive_1_rollNo_1' }
  );

  const m2 = db.collection('students').find({
    mentorId: sampleFaculty._id,
    isActive: true
  }).sort({ rollNo: 1 }).limit(100);

  const expM2 = await m2.explain('executionStats');
  console.log(`Stage after index: ${expM2.executionStats.executionStages.stage} (inputStage: ${expM2.executionStats.executionStages.inputStage?.stage})`);

  // 4. NodueRequest by Student + createdAt
  console.log('\n--- 4. NodueRequest Student Query ---');
  console.log('Ensuring index: { studentId: 1, createdAt: -1 }...');
  await db.collection('noduerequests').createIndex(
    { studentId: 1, createdAt: -1 },
    { background: true, name: 'studentId_1_createdAt_-1' }
  );
  console.log('Index created successfully!');

  await mongoose.disconnect();
}

verifyIndexImpact().catch(console.error);
