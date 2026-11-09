#!/usr/bin/env node

/**
 * capture-baseline.js — Captures Phase 0 Performance & Schema Baseline
 * TRD Reference: TRD §5 Phase 0 (Step 0.4) | Constraints: NC-1, NC-2
 *
 * Usage:
 *   node scripts/capture-baseline.js [MONGO_URI] [--output=docs/phase0-baseline.md]
 *
 * What it captures:
 *   1. Collection document counts and storage metrics
 *   2. Complete index inventory across all collections
 *   3. explain('executionStats') query plans for core queries:
 *      - Student Status (requests & approvals by studentId)
 *      - Batch Grid (approvals & requests by batchId)
 *      - Approve action lookup (by approvalId & facultyId)
 *      - Batch Initiate roster lookup (by classId & active status)
 *   4. Latency benchmarks (p50, p95) across 20 query runs
 *
 * Safe & Read-Only:
 *   - Only runs read queries (.find, .explain, .stats, .indexes)
 *   - Redacts credentials in output
 */

const path = require('path');
const fs = require('fs');

let mongoose;
try {
  mongoose = require('mongoose');
} catch (e) {
  try {
    mongoose = require(path.resolve(__dirname, '../server/node_modules/mongoose'));
  } catch (e2) {
    console.error('Error: Could not locate mongoose. Ensure dependencies are installed in ./server.');
    process.exit(1);
  }
}

function redactUri(uri) {
  if (!uri) return '';
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
}

function parseArgs() {
  const args = process.argv.slice(2);
  let uri = process.env.STAGING_URI || process.env.TEST_URI || null;
  let outputPath = path.resolve(__dirname, '../docs/phase0-baseline.md');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--uri=')) {
      uri = arg.substring(6);
    } else if (arg === '--uri' && args[i + 1]) {
      uri = args[++i];
    } else if (arg.startsWith('--output=')) {
      outputPath = path.resolve(process.cwd(), arg.substring(9));
    } else if (!arg.startsWith('-') && !uri) {
      uri = arg;
    }
  }

  return { uri, outputPath };
}

function calculatePercentiles(latencies) {
  if (!latencies || latencies.length === 0) return { p50: 0, p95: 0, min: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { p50: Number(p50.toFixed(2)), p95: Number(p95.toFixed(2)), min: Number(min.toFixed(2)), max: Number(max.toFixed(2)) };
}

async function benchmarkQuery(queryFn, iterations = 20) {
  const latencies = [];
  // Warmup run
  try {
    await queryFn();
  } catch (err) {
    // If warmup fails, return empty
    return { p50: 0, p95: 0, min: 0, max: 0, error: err.message };
  }

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await queryFn();
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    latencies.push(ms);
  }

  return calculatePercentiles(latencies);
}

async function main() {
  const { uri, outputPath } = parseArgs();

  if (!uri) {
    console.error('Error: No MongoDB URI provided.');
    console.error('Usage: node scripts/capture-baseline.js <MONGO_URI> [--output=docs/phase0-baseline.md]');
    process.exit(1);
  }

  const redacted = redactUri(uri);
  console.log(`Connecting to: ${redacted}`);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
  } catch (err) {
    console.error(`Connection failed: ${err.message}`);
    process.exit(1);
  }

  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  const capturedAt = new Date().toISOString();

  console.log(`Analyzing database: ${dbName}...`);

  // 1. Enumerate Collections & Stats
  const rawCollections = await db.listCollections().toArray();
  const collectionNames = rawCollections
    .map(c => c.name)
    .filter(name => !name.startsWith('system.'))
    .sort();

  const collectionStats = [];
  const indexInventory = {};

  for (const name of collectionNames) {
    const coll = db.collection(name);
    const count = await coll.countDocuments({});

    let stats = { count, size: 0, avgObjSize: 0, storageSize: 0, totalIndexSize: 0 };
    try {
      const s = await db.command({ collStats: name });
      stats = {
        count: s.count ?? count,
        size: s.size ?? 0,
        avgObjSize: s.avgObjSize ?? 0,
        storageSize: s.storageSize ?? 0,
        totalIndexSize: s.totalIndexSize ?? 0,
      };
    } catch (e) {
      // Some serverless tiers or versions disable collStats; fallback to basic count
    }
    collectionStats.push({ name, ...stats });

    // Indexes
    try {
      const indexes = await coll.indexes();
      indexInventory[name] = indexes;
    } catch (e) {
      indexInventory[name] = [{ name: 'error', key: { error: e.message } }];
    }
  }

  // 2. Query Plans and Benchmarks for Core Workflows
  console.log('Profiling core query workflows...');

  // Sample IDs for queries
  const sampleRequest = await db.collection('noduerequests').findOne({});
  const sampleApproval = await db.collection('nodueapprovals').findOne({});
  const sampleClass = await db.collection('classes').findOne({});

  const sampleStudentId = sampleRequest ? sampleRequest.studentId : new mongoose.Types.ObjectId();
  const sampleBatchId = sampleRequest ? sampleRequest.batchId : new mongoose.Types.ObjectId();
  const sampleFacultyId = sampleApproval ? sampleApproval.facultyId : new mongoose.Types.ObjectId();
  const sampleApprovalId = sampleApproval ? sampleApproval._id : new mongoose.Types.ObjectId();
  const sampleClassId = sampleClass ? sampleClass._id : new mongoose.Types.ObjectId();

  // Explain Plans
  let explainStudentStatusReq = null;
  let explainStudentStatusAppr = null;
  let explainBatchGridAppr = null;
  let explainApproveLookup = null;
  let explainBatchInitiateClass = null;

  try {
    explainStudentStatusReq = await db.collection('noduerequests')
      .find({ studentId: sampleStudentId, batchId: sampleBatchId })
      .explain('executionStats');
  } catch (e) { explainStudentStatusReq = { error: e.message }; }

  try {
    explainStudentStatusAppr = await db.collection('nodueapprovals')
      .find({ studentId: sampleStudentId, batchId: sampleBatchId })
      .explain('executionStats');
  } catch (e) { explainStudentStatusAppr = { error: e.message }; }

  try {
    explainBatchGridAppr = await db.collection('nodueapprovals')
      .find({ batchId: sampleBatchId })
      .explain('executionStats');
  } catch (e) { explainBatchGridAppr = { error: e.message }; }

  try {
    explainApproveLookup = await db.collection('nodueapprovals')
      .find({ _id: sampleApprovalId, facultyId: sampleFacultyId })
      .explain('executionStats');
  } catch (e) { explainApproveLookup = { error: e.message }; }

  try {
    explainBatchInitiateClass = await db.collection('classes')
      .find({ _id: sampleClassId })
      .explain('executionStats');
  } catch (e) { explainBatchInitiateClass = { error: e.message }; }

  // Benchmarks
  const benchStudentStatusReq = await benchmarkQuery(() =>
    db.collection('noduerequests').find({ studentId: sampleStudentId, batchId: sampleBatchId }).toArray()
  );
  const benchStudentStatusAppr = await benchmarkQuery(() =>
    db.collection('nodueapprovals').find({ studentId: sampleStudentId, batchId: sampleBatchId }).toArray()
  );
  const benchBatchGridAppr = await benchmarkQuery(() =>
    db.collection('nodueapprovals').find({ batchId: sampleBatchId }).limit(100).toArray()
  );
  const benchApproveLookup = await benchmarkQuery(() =>
    db.collection('nodueapprovals').findOne({ _id: sampleApprovalId, facultyId: sampleFacultyId })
  );
  const benchBatchInitiateClass = await benchmarkQuery(() =>
    db.collection('classes').findOne({ _id: sampleClassId })
  );

  await mongoose.disconnect();

  // Format Helper for Explain Stats
  function summarizePlan(plan) {
    if (!plan || plan.error) return `*Execution Error:* ${plan?.error || 'Unavailable'}`;
    const stats = plan.executionStats || {};
    const stage = plan.queryPlanner?.winningPlan?.stage || 'UNKNOWN';
    const inputStage = plan.queryPlanner?.winningPlan?.inputStage?.stage || '';
    const indexName = plan.queryPlanner?.winningPlan?.inputStage?.indexName ||
                      plan.queryPlanner?.winningPlan?.indexName || 'NONE (COLLSCAN)';
    return [
      `- **Winning Stage:** \`${stage}\`${inputStage ? ` (input: \`${inputStage}\`)` : ''}`,
      `- **Index Used:** \`${indexName}\``,
      `- **Total Docs Examined:** ${stats.totalDocsExamined ?? 'N/A'}`,
      `- **Total Keys Examined:** ${stats.totalKeysExamined ?? 'N/A'}`,
      `- **Execution Time:** ${stats.executionTimeMillis ?? 'N/A'} ms`,
    ].join('\n');
  }

  // 3. Assemble Markdown Report
  const md = `# Phase 0 Baseline Performance & Schema Audit
**Database:** \`${dbName}\`  
**Captured At:** \`${capturedAt}\`  
**Target Host:** \`${redacted}\`  
**TRD Reference:** TRD §5 Phase 0 (Step 0.4) | Non-Negotiable Constraints: NC-1, NC-2, NC-6

---

## 1. Executive Summary

This document captures the baseline state of the live/staging database prior to introducing any Phase 1 additive schemas (batches, semesterSubjects, feature flags). It establishes the performance and index reference against which all subsequent migration phases must be validated to ensure zero regression.

---

## 2. Collection Inventory & Storage Metrics

| Collection | Documents | Data Size | Storage Size | Index Size | Avg Doc Size |
|---|---|---|---|---|---|
${collectionStats.map(s => `| \`${s.name}\` | ${s.count.toLocaleString()} | ${(s.size / 1024).toFixed(1)} KB | ${(s.storageSize / 1024).toFixed(1)} KB | ${(s.totalIndexSize / 1024).toFixed(1)} KB | ${s.avgObjSize.toFixed(0)} B |`).join('\n')}

---

## 3. Index Inventory

All existing collection indexes are cataloged below. Phase 1 through Phase 5 migrations must not drop or invalidate any existing operational indexes.

${Object.entries(indexInventory).map(([collName, idxList]) => `
### \`${collName}\`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
${idxList.map(idx => `| \`${idx.name}\` | \`${JSON.stringify(idx.key)}\` | ${idx.unique ? '✅ Yes' : 'No'} | ${idx.sparse ? '✅ Yes' : 'No'} |`).join('\n')}
`).join('\n')}

---

## 4. Query Latency Benchmarks (Pre-Migration Baseline)

Benchmarked over 20 iterations using warm connection pool:

| Query Workflow | Target Collection & Key | p50 (ms) | p95 (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|---|
| **Student Status (Request)** | \`noduerequests\` by \`{ studentId, batchId }\` | ${benchStudentStatusReq.p50} | ${benchStudentStatusReq.p95} | ${benchStudentStatusReq.min} | ${benchStudentStatusReq.max} |
| **Student Status (Approvals)** | \`nodueapprovals\` by \`{ studentId, batchId }\` | ${benchStudentStatusAppr.p50} | ${benchStudentStatusAppr.p95} | ${benchStudentStatusAppr.min} | ${benchStudentStatusAppr.max} |
| **Batch Grid (Approvals)** | \`nodueapprovals\` by \`{ batchId }\` (limit 100) | ${benchBatchGridAppr.p50} | ${benchBatchGridAppr.p95} | ${benchBatchGridAppr.min} | ${benchBatchGridAppr.max} |
| **Faculty Approve Lookup** | \`nodueapprovals\` by \`{ _id, facultyId }\` | ${benchApproveLookup.p50} | ${benchApproveLookup.p95} | ${benchApproveLookup.min} | ${benchApproveLookup.max} |
| **Batch Initiate (Class)** | \`classes\` by \`{ _id }\` | ${benchBatchInitiateClass.p50} | ${benchBatchInitiateClass.p95} | ${benchBatchInitiateClass.min} | ${benchBatchInitiateClass.max} |

---

## 5. Query Execution Plans (\`explain('executionStats')\`)

### 5.1 Student Status: Request Lookup (\`noduerequests\`)
\`\`\`javascript
db.noduerequests.find({ studentId: ObjectId("${sampleStudentId}"), batchId: ObjectId("${sampleBatchId}") })
\`\`\`
${summarizePlan(explainStudentStatusReq)}

### 5.2 Student Status: Approvals List (\`nodueapprovals\`)
\`\`\`javascript
db.nodueapprovals.find({ studentId: ObjectId("${sampleStudentId}"), batchId: ObjectId("${sampleBatchId}") })
\`\`\`
${summarizePlan(explainStudentStatusAppr)}

### 5.3 Batch Grid: Approvals List (\`nodueapprovals\`)
\`\`\`javascript
db.nodueapprovals.find({ batchId: ObjectId("${sampleBatchId}") })
\`\`\`
${summarizePlan(explainBatchGridAppr)}

### 5.4 Faculty Approve: Approval Record Lookup (\`nodueapprovals\`)
\`\`\`javascript
db.nodueapprovals.find({ _id: ObjectId("${sampleApprovalId}"), facultyId: ObjectId("${sampleFacultyId}") })
\`\`\`
${summarizePlan(explainApproveLookup)}

### 5.5 Batch Initiate: Class Lookup (\`classes\`)
\`\`\`javascript
db.classes.find({ _id: ObjectId("${sampleClassId}") })
\`\`\`
${summarizePlan(explainBatchInitiateClass)}

---

## 6. Performance Regression Gate (Exit Criteria)

During Phase 1 (additive schema) and Phase 2 (batch inference migration):
1. **p95 latency** for \`GET /api/student/status\` must remain **< 300ms**.
2. **Execution stage** for \`noduerequests\` and \`nodueapprovals\` lookups must remain index-backed (\`IXSCAN\`), never degrading to full collection scan (\`COLLSCAN\`).
3. Total index count on existing collections must not decrease without an explicit migration changelog entry.
`;

  fs.writeFileSync(outputPath, md, 'utf8');
  console.log(`Baseline report successfully written to: ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error in capture-baseline:', err);
  process.exit(1);
});
