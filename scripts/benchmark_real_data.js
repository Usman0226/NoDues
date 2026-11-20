import mongoose from 'mongoose';

const uri = 'mongodb+srv://projectsclgmits_db_user:sHx7HKaoq7nqnE5K@cluster0.lgbf0fe.mongodb.net/test?appName=Cluster0';

async function main() {
  console.log('Connecting to real Atlas dataset (test)...');
  const tStart = performance.now();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected in ${(performance.now() - tStart).toFixed(1)}ms`);

  const db = mongoose.connection.db;

  // 1. WAN Ping RTT
  const pings = [];
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now();
    await db.command({ ping: 1 });
    pings.push(performance.now() - t0);
  }
  pings.sort((a, b) => a - b);
  const p50_ping = pings[Math.floor(pings.length * 0.5)];
  const p95_ping = pings[Math.floor(pings.length * 0.95)];
  console.log(`\n=== 1. WAN Network RTT (Atlas Cluster0) ===`);
  console.log(`p50 RTT: ${p50_ping.toFixed(1)}ms | p95 RTT: ${p95_ping.toFixed(1)}ms | Min: ${pings[0].toFixed(1)}ms | Max: ${pings[pings.length - 1].toFixed(1)}ms`);
  console.log(`⚠️ CRITICAL ARCHITECTURAL FINDING: Every sequential round-trip to Atlas costs ~${p50_ping.toFixed(0)}ms baseline due to physical network distance!`);

  // 2. Fetch sample IDs from real data
  const sampleStudent = await db.collection('students').findOne({ isActive: true });
  const sampleFaculty = await db.collection('faculties').findOne({ isActive: true });
  const sampleBatch = await db.collection('noduebatches').findOne({ status: 'active' }) || await db.collection('noduebatches').findOne({});
  const sampleClass = await db.collection('classes').findOne({ isActive: true });

  console.log(`\nSample entities used for real-data benchmark:`);
  console.log(`  Student: ${sampleStudent?.rollNo} (${sampleStudent?._id})`);
  console.log(`  Faculty: ${sampleFaculty?.name} (${sampleFaculty?._id})`);
  console.log(`  Batch: ${sampleBatch?.className} (${sampleBatch?._id})`);
  console.log(`  Class: ${sampleClass?.name} (${sampleClass?._id})`);

  // 3. Benchmark Core Queries with 15 runs each
  const benchmarks = [
    {
      name: 'Faculty Pending Approvals (nodueapprovals.find by facultyId, action)',
      coll: 'nodueapprovals',
      query: () => ({ facultyId: sampleFaculty?._id, action: { $in: ['pending', 'not_submitted'] } }),
      sort: { studentRollNo: 1 },
      limit: 20
    },
    {
      name: 'Faculty All Approvals count by batch (nodueapprovals.aggregate by batchId, action)',
      coll: 'nodueapprovals',
      agg: () => [
        { $match: { facultyId: sampleFaculty?._id } },
        { $group: { _id: { batchId: '$batchId', action: '$action' }, count: { $sum: 1 } } }
      ]
    },
    {
      name: 'Student Status Page (nodueapprovals.find by studentId, batchId)',
      coll: 'nodueapprovals',
      query: () => ({ studentId: sampleStudent?._id, batchId: sampleBatch?._id }),
      limit: 50
    },
    {
      name: 'Student Request Lookup (noduerequests.findOne by studentId, batchId)',
      coll: 'noduerequests',
      query: () => ({ studentId: sampleStudent?._id, batchId: sampleBatch?._id }),
      limit: 1
    },
    {
      name: 'Faculty Mentee List (students.find by mentorId)',
      coll: 'students',
      query: () => ({ mentorId: sampleFaculty?._id, isActive: true }),
      limit: 100
    },
    {
      name: 'Batch Approvals Grid (nodueapprovals.find by batchId)',
      coll: 'nodueapprovals',
      query: () => ({ batchId: sampleBatch?._id }),
      limit: 100
    },
    {
      name: 'Student Directory Search (regex on rollNo or name across 1448 students)',
      coll: 'students',
      query: () => ({ $or: [{ rollNo: /21/i }, { name: /kumar/i }] }),
      limit: 20
    },
    {
      name: 'Approval History (nodueapprovals.find with sort actionedAt: -1)',
      coll: 'nodueapprovals',
      query: () => ({ facultyId: sampleFaculty?._id, action: { $nin: ['pending', 'not_submitted'] } }),
      sort: { actionedAt: -1 },
      limit: 20
    }
  ];

  console.log(`\n=== 2. Real-Data Query Latency Benchmarks (15 iterations each) ===`);
  const report = [];

  for (const b of benchmarks) {
    const times = [];
    let count = 0;
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      if (b.agg) {
        const res = await db.collection(b.coll).aggregate(b.agg()).toArray();
        count = res.length;
      } else {
        let cursor = db.collection(b.coll).find(b.query());
        if (b.sort) cursor = cursor.sort(b.sort);
        if (b.limit) cursor = cursor.limit(b.limit);
        const res = await cursor.toArray();
        count = res.length;
      }
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.5)];
    const p90 = times[Math.floor(times.length * 0.9)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const avg = times.reduce((a, b) => a + b, 0) / times.length;

    // Explain query
    let explainStage = 'N/A';
    let docsExamined = 'N/A';
    let keysExamined = 'N/A';
    try {
      if (!b.agg) {
        let c = db.collection(b.coll).find(b.query());
        if (b.sort) c = c.sort(b.sort);
        if (b.limit) c = c.limit(b.limit);
        const exp = await c.explain('executionStats');
        const stats = exp.executionStats;
        explainStage = stats?.executionStages?.stage || stats?.executionStages?.inputStage?.stage || 'UNKNOWN';
        docsExamined = stats?.totalDocsExamined ?? 'N/A';
        keysExamined = stats?.totalKeysExamined ?? 'N/A';
      }
    } catch (e) {
      explainStage = 'ERR: ' + e.message;
    }

    report.push({
      Benchmark: b.name,
      Results: count,
      'Avg (ms)': avg.toFixed(1),
      'p50 (ms)': p50.toFixed(1),
      'p90 (ms)': p90.toFixed(1),
      'p95 (ms)': p95.toFixed(1),
      Stage: explainStage,
      DocsExam: docsExamined,
      KeysExam: keysExamined
    });
  }

  console.table(report);

  // 4. Index Inventory on nodueapprovals & students
  console.log(`\n=== 3. Current Indexes on nodueapprovals (25,397 records) ===`);
  const approvalIndexes = await db.collection('nodueapprovals').indexes();
  console.table(approvalIndexes.map(idx => ({ name: idx.name, key: JSON.stringify(idx.key) })));

  console.log(`\n=== 4. Current Indexes on students (1,448 records) ===`);
  const studentIndexes = await db.collection('students').indexes();
  console.table(studentIndexes.map(idx => ({ name: idx.name, key: JSON.stringify(idx.key) })));

  await mongoose.disconnect();
}

main().catch(console.error);
