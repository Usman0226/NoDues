import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

const uri = process.env.MONGODB_URI;

async function runProfile() {
  console.log('Connecting to MongoDB...');
  const startConnect = Date.now();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const connectDuration = Date.now() - startConnect;
  console.log(`Connected in ${connectDuration}ms to: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);

  const db = mongoose.connection.db;

  // 1. Measure Raw Ping Latency over WAN
  console.log('\n--- 1. Measuring WAN Round-Trip Network Latency (10 Pings) ---');
  const pingLatencies = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    await db.command({ ping: 1 });
    const t1 = performance.now();
    pingLatencies.push(t1 - t0);
  }
  pingLatencies.sort((a, b) => a - b);
  const p50_ping = pingLatencies[Math.floor(pingLatencies.length * 0.5)];
  const p95_ping = pingLatencies[Math.floor(pingLatencies.length * 0.95)];
  const avg_ping = pingLatencies.reduce((a, b) => a + b, 0) / pingLatencies.length;
  console.log(`Ping Latency (WAN Network RTT to Atlas):`);
  console.log(`  Min: ${pingLatencies[0].toFixed(2)}ms | p50: ${p50_ping.toFixed(2)}ms | p95: ${p95_ping.toFixed(2)}ms | Max: ${pingLatencies[pingLatencies.length - 1].toFixed(2)}ms | Avg: ${avg_ping.toFixed(2)}ms`);

  // 2. Collection Inventory
  console.log('\n--- 2. Collection Document Counts & Storage ---');
  const collections = await db.listCollections().toArray();
  const collStats = [];
  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments();
    const indexes = await db.collection(c.name).indexes();
    collStats.push({
      Collection: c.name,
      Documents: count,
      Indexes: indexes.length
    });
  }
  collStats.sort((a, b) => b.Documents - a.Documents);
  console.table(collStats);

  // 3. Measure Key Query Latencies
  console.log('\n--- 3. Measuring Critical Query Response Times (p50 / p95) ---');
  const queriesToTest = [
    {
      name: 'Student.find({ classId, isActive: true })',
      coll: 'students',
      query: { isActive: true },
      limit: 100
    },
    {
      name: 'NodueApproval.find({ batchId }) (limit 100)',
      coll: 'nodueapprovals',
      query: {},
      limit: 100
    },
    {
      name: 'NodueApproval.find({ facultyId, action: "pending" })',
      coll: 'nodueapprovals',
      query: { action: 'pending' },
      limit: 50
    },
    {
      name: 'NodueRequest.find({ batchId })',
      coll: 'noduerequests',
      query: {},
      limit: 100
    },
    {
      name: 'Class.find({ isActive: true })',
      coll: 'classes',
      query: { isActive: true },
      limit: 50
    }
  ];

  const queryResults = [];
  for (const q of queriesToTest) {
    const times = [];
    let sampleExplain = null;
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      const docs = await db.collection(q.coll).find(q.query).limit(q.limit).toArray();
      const t1 = performance.now();
      times.push(t1 - t0);
    }
    sampleExplain = await db.collection(q.coll).find(q.query).limit(q.limit).explain('executionStats');
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const winningStage = sampleExplain?.executionStats?.executionStages?.stage || sampleExplain?.queryPlanner?.winningPlan?.stage || 'UNKNOWN';
    const totalDocsExamined = sampleExplain?.executionStats?.totalDocsExamined ?? 'N/A';
    const totalKeysExamined = sampleExplain?.executionStats?.totalKeysExamined ?? 'N/A';

    queryResults.push({
      Query: q.name,
      'p50 (ms)': p50.toFixed(2),
      'p95 (ms)': p95.toFixed(2),
      Stage: winningStage,
      DocsExamined: totalDocsExamined,
      KeysExamined: totalKeysExamined
    });
  }
  console.table(queryResults);

  await mongoose.disconnect();
}

runProfile().catch(console.error);
