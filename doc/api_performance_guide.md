# API Performance Guide
## Building Lightning-Fast APIs for the No-Due Clearance System

**Project:** No-Due Clearance System (NDS)  
**Version:** 1.0  
**Date:** April 2026

> This guide covers every layer of the stack — database, server, caching, network, and frontend data fetching — with concrete implementation patterns specific to NDS. Follow these in order of impact.

---

## Table of Contents

1. [The Mental Model — Where Time Actually Goes](#1-the-mental-model)
2. [MongoDB Query Optimization](#2-mongodb-query-optimization)
3. [Mongoose-Specific Patterns](#3-mongoose-specific-patterns)
4. [Caching Strategy](#4-caching-strategy)
5. [API Response Shaping](#5-api-response-shaping)
6. [Bulk Operations](#6-bulk-operations)
7. [Connection & Server Optimization](#7-connection--server-optimization)
8. [Frontend Data Fetching](#8-frontend-data-fetching)
9. [Peak Load Strategy](#9-peak-load-strategy)
10. [Measuring & Debugging Slowness](#10-measuring--debugging-slowness)

---

## 1. The Mental Model

Before writing a single line of optimization, understand where time actually goes in a request:

```
Browser sends request
      │
      ▼  [Network latency — 10-100ms, you can't control this]
      │
      ▼  [Express routing + middleware — <1ms if done right]
      │
      ▼  [Business logic — <1ms if done right]
      │
      ▼  [Database query — 1ms to 5000ms — THIS IS WHERE YOU LOSE]
      │
      ▼  [Response serialization — <1ms for small payloads]
      │
      ▼  [Network back to browser]
      │
      ▼  [Frontend rendering — separate concern]
```

**90% of your API slowness is the database query.** Everything else is noise. Fix the DB layer first, then worry about everything else.

### The Three Root Causes of Slow APIs

**1. Collection scans** — MongoDB reads every document to find yours because there's no index.  
**2. Over-fetching** — You query 50 fields and send them all when the UI needs 5.  
**3. N+1 queries** — You make one query to get a list, then one query per item to get related data. 10 items = 11 queries. 100 items = 101 queries.

Everything in this guide is a solution to one of these three problems.

---

## 2. MongoDB Query Optimization

### 2.1 Indexes — The Single Biggest Impact

An index turns a collection scan O(n) into a B-tree lookup O(log n). For 5,000 approval documents, an unindexed query reads all 5,000. An indexed query reads ~12.

**NDS Critical Indexes — implement all of these before any other optimization:**

```javascript
// models/NodueApproval.js
nodueApprovalSchema.index(
  { requestId: 1, facultyId: 1, subjectId: 1, roleTag: 1 },
  { unique: true }
)
// ↑ Most important. The peak-load query: "all approvals for this student"

nodueApprovalSchema.index({ batchId: 1, facultyId: 1, action: 1 })
// ↑ Faculty pending list: "all pending approvals for Dr. Sharma in batch X"

nodueApprovalSchema.index({ batchId: 1, action: 1 })
// ↑ Admin batch grid: "how many approved/pending/due in this batch"

nodueApprovalSchema.index({ studentId: 1, batchId: 1 })
// ↑ Student status page — the most-hit endpoint at peak load

nodueApprovalSchema.index({ facultyId: 1, action: 1 })
// ↑ Faculty dashboard: total pending count across all batches

// models/NodueRequest.js
nodueRequestSchema.index({ batchId: 1, status: 1 })
// ↑ Admin batch overview: count by status

nodueRequestSchema.index({ studentId: 1 })
// ↑ Student history lookup

// models/Student.js
studentSchema.index({ rollNo: 1 }, { unique: true })
// ↑ Student login — hits on every student session start

studentSchema.index({ classId: 1 })
// ↑ Class student list — admin class page

studentSchema.index({ mentorId: 1 })
// ↑ Mentor's student list

// models/Faculty.js
facultySchema.index({ email: 1 }, { unique: true })
// ↑ Faculty login

facultySchema.index({ departmentId: 1, roleTags: 1 })
// ↑ HoD scoped faculty list
```

**How to verify an index is being used:**
```javascript
// Run this in MongoDB Atlas Data Explorer or mongosh
db.nodueApprovals.find({ batchId: "xxx", facultyId: "yyy", action: "pending" })
  .explain("executionStats")
// Look for: "stage": "IXSCAN" (good) vs "stage": "COLLSCAN" (bad)
// Look for: "totalDocsExamined" — should be close to "nReturned"
```

---

### 2.2 Projection — Only Fetch What You Need

Every field you fetch costs memory and serialization time. The list endpoint doesn't need `facultySnapshot` (can be 2KB per document). The student status page doesn't need `createdAt` on every approval.

**Bad — fetches everything:**
```javascript
// Returns 20+ fields per document
const requests = await NodueRequest.find({ batchId })
```

**Good — project only what the UI needs:**
```javascript
// Batch grid only needs these fields per student
const requests = await NodueRequest.find(
  { batchId },
  {
    _id: 1,
    studentId: 1,
    'studentSnapshot.rollNo': 1,
    'studentSnapshot.name': 1,
    status: 1,
  }
)
```

**Rule of thumb for NDS:**
- List endpoints → project 4–6 fields max
- Detail endpoints → project everything needed for that specific view, nothing more
- Never return `passwordHash`, `__v`, internal fields

---

### 2.3 Eliminate N+1 Queries

This is the most common silent killer. Example of the problem:

```javascript
// ❌ WRONG — N+1 pattern
// 1 query to get students
const students = await Student.find({ classId })

// Then 65 MORE queries — one per student
for (const student of students) {
  const mentor = await Faculty.findById(student.mentorId)  // ← N+1
  student.mentorName = mentor.name
}
// Total: 66 queries for 65 students
```

**Solution — use `populate` or aggregation pipeline:**

```javascript
// ✅ CORRECT — 2 queries total (Mongoose populate)
const students = await Student.find({ classId })
  .populate('mentorId', 'name employeeId email')
  .select('rollNo name email mentorId semester')
// Total: 2 queries regardless of student count
```

**For complex data — use aggregation `$lookup`:**
```javascript
// ✅ Single query — fetch requests + student info in one shot
const requests = await NodueRequest.aggregate([
  { $match: { batchId: new mongoose.Types.ObjectId(batchId) } },
  {
    $lookup: {
      from: 'students',
      localField: 'studentId',
      foreignField: '_id',
      as: 'student',
      pipeline: [{ $project: { rollNo: 1, name: 1 } }]  // ← project inside lookup
    }
  },
  { $unwind: '$student' },
  {
    $project: {
      'student.rollNo': 1,
      'student.name': 1,
      status: 1,
    }
  }
])
```

**When to use populate vs aggregation:**
- `populate` — simple lookups, 1–2 levels deep, development speed matters
- `aggregation` — complex joins, filtering on joined data, computed fields, performance-critical paths

---

### 2.4 Lean Queries

By default, Mongoose wraps every document in a full Mongoose Document object with getters, setters, and methods. For read-only API responses, this is pure overhead.

```javascript
// ❌ Full Mongoose Document — unnecessary overhead for reads
const students = await Student.find({ classId })

// ✅ Plain JS object — faster, less memory
const students = await Student.find({ classId }).lean()

// Performance difference: ~2–5x faster for large result sets
// .lean() returns plain objects, so no .save(), no virtuals
// Use it on every read that doesn't need Mongoose document methods
```

**When NOT to use `.lean()`:**
- When you need to call `.save()` on the result
- When you rely on Mongoose virtuals
- When you need document middleware to run

---

### 2.5 Avoid Large `$in` Arrays

The `$in` operator with many values causes multiple index lookups. If you find yourself doing this:

```javascript
// ❌ Potentially slow for large arrays
const approvals = await NodueApproval.find({
  requestId: { $in: requestIds }  // 650 IDs
})
```

Restructure the query to use a more direct indexed field:

```javascript
// ✅ Single indexed field lookup
const approvals = await NodueApproval.find({ batchId })
// batchId is indexed and gets all approvals for the batch in one scan
```

In NDS, `batchId` is denormalized onto every approval document precisely to avoid large `$in` arrays.

---

### 2.6 Count Without Fetching Documents

When you need counts for the admin dashboard (cleared/pending/has_dues), never fetch documents just to count them:

```javascript
// ❌ Fetches all documents into memory just to count
const cleared = (await NodueRequest.find({ batchId, status: 'cleared' })).length

// ✅ Count at DB level — returns a single number, zero document transfer
const cleared = await NodueRequest.countDocuments({ batchId, status: 'cleared' })

// ✅✅ Even better — get all counts in one aggregation query
const summary = await NodueRequest.aggregate([
  { $match: { batchId: new mongoose.Types.ObjectId(batchId) } },
  {
    $group: {
      _id: '$status',
      count: { $sum: 1 }
    }
  }
])
// Returns: [{ _id: 'cleared', count: 20 }, { _id: 'pending', count: 40 }, ...]
// One query instead of four
```

---

### 2.7 Pagination — Never Return Unbounded Lists

Never return all documents without a limit. Even if there are only 65 students today, design for 650.

```javascript
// ❌ No pagination — returns everything
const students = await Student.find({ classId })

// ✅ Always paginate
const page = parseInt(req.query.page) || 1
const limit = parseInt(req.query.limit) || 20
const skip = (page - 1) * limit

const [students, total] = await Promise.all([
  Student.find({ classId })
    .select('rollNo name email mentorId semester')
    .lean()
    .skip(skip)
    .limit(limit)
    .sort({ rollNo: 1 }),
  Student.countDocuments({ classId })
])

// Return both data and pagination metadata
res.json({
  success: true,
  data: students,
  pagination: {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
  }
})
```

**Exception:** The batch status grid and student approval list are small enough (65 students, ~500 approvals) that pagination isn't required — but still add `limit(200)` as a safety ceiling.

---

## 3. Mongoose-Specific Patterns

### 3.1 Parallel Queries with Promise.all

Never `await` queries sequentially when they're independent:

```javascript
// ❌ Sequential — total time = query1 + query2 + query3
const batch = await NodueBatch.findById(batchId)
const requests = await NodueRequest.find({ batchId }).lean()
const summary = await NodueRequest.aggregate([...])

// ✅ Parallel — total time = max(query1, query2, query3)
const [batch, requests, summary] = await Promise.all([
  NodueBatch.findById(batchId).lean(),
  NodueRequest.find({ batchId }).select('studentSnapshot status').lean(),
  NodueRequest.aggregate([
    { $match: { batchId: new mongoose.Types.ObjectId(batchId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ])
])
```

If query1 takes 20ms, query2 takes 15ms, query3 takes 10ms:
- Sequential: 45ms total
- Parallel: 20ms total

**Use `Promise.all` everywhere queries are independent.** This is one of the highest-impact, lowest-effort optimizations.

---

### 3.2 Select Early, Not Late

Chain `.select()` immediately after `.find()` so Mongoose knows what to project before executing:

```javascript
// ✅ Correct chaining order
Student.find({ classId })
  .select('rollNo name email mentorId')  // ← project first
  .lean()                                // ← then lean
  .sort({ rollNo: 1 })                  // ← then sort
  .skip(skip)
  .limit(limit)
```

---

### 3.3 Mongoose Connection Pooling

The connection pool is shared across all requests. Without it, every request opens a new DB connection — expensive.

```javascript
// config/db.js
mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 10,        // max 10 concurrent connections
  minPoolSize: 2,         // keep 2 warm connections alive at all times
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  // Do NOT set bufferCommands: false — let Mongoose buffer during reconnect
})

// Connect ONCE on server start — never connect inside route handlers
```

With `minPoolSize: 2`, the first requests after a cold start don't wait for connection establishment. Two connections are always ready.

---

### 3.4 Avoid Mongoose Middleware on Hot Paths

Mongoose `pre` and `post` hooks run on every operation. If you have a `post('save')` hook that does logging or sending emails, make sure it doesn't block the response:

```javascript
// ❌ Blocks the save until email sends (could be 200-500ms)
nodueApprovalSchema.post('save', async function() {
  await sendEmail(...)  // ← blocking
})

// ✅ Fire and forget — don't await, don't block
nodueApprovalSchema.post('save', function() {
  sendEmail(...).catch(console.error)  // ← non-blocking
})
```

---

## 4. Caching Strategy

### 4.1 The NDS Cache Map

Cache entries that are expensive to compute and read far more often than they change:

```javascript
// config/cache.js
import NodeCache from 'node-cache'

export const cache = new NodeCache({
  stdTTL: 60,           // default TTL: 60 seconds
  checkperiod: 120,     // sweep for expired keys every 2 min
  useClones: false,     // don't clone objects on get/set — faster
})
```

| Cache Key Pattern | TTL | Hit Rate | Invalidate When |
|---|---|---|---|
| `student_status:{studentId}` | 30s | Very High — students refresh constantly at deadline | Any approval action for that student |
| `batch_status:{batchId}` | 60s | High — admin grid refreshes frequently | Any approval action in that batch |
| `faculty_pending:{facultyId}:{batchId}` | 30s | High — faculty pending list | Faculty submits any action |
| `batch_summary:{batchId}` | 30s | High — dashboard counts | Any status change in batch |
| `class_detail:{classId}` | 300s | Medium — rarely changes | Class edited |
| `subject_list` | 600s | Low — subjects almost never change | Subject created/updated |

---

### 4.2 Cache Wrapper Pattern

Build a reusable wrapper so every cached route looks the same:

```javascript
// utils/withCache.js
export const withCache = async (key, ttl, fetchFn) => {
  const cached = cache.get(key)
  if (cached !== undefined) return cached   // ← cache hit, return immediately

  const data = await fetchFn()              // ← cache miss, hit DB
  cache.set(key, data, ttl)
  return data
}

// Usage in route handler:
const status = await withCache(
  `student_status:${studentId}`,
  30,
  () => buildStudentStatus(studentId)       // ← only called on cache miss
)
res.json({ success: true, data: status })
```

---

### 4.3 Targeted Invalidation — Never Flush Everything

When data changes, invalidate only the affected keys. Never `cache.flushAll()` — that makes every subsequent request a cache miss simultaneously (thundering herd problem at peak load).

```javascript
// services/statusService.js
// Called after every approval action
export const recomputeAndInvalidate = async (approvalId) => {
  const approval = await NodueApproval.findById(approvalId)
    .select('requestId batchId studentId facultyId')
    .lean()

  // 1. Recompute request status
  const allApprovals = await NodueApproval.find({ requestId: approval.requestId })
    .select('action')
    .lean()

  const newStatus = computeStatus(allApprovals)

  await NodueRequest.findByIdAndUpdate(approval.requestId, { status: newStatus })

  // 2. Invalidate only affected cache keys — surgical, not global
  cache.del(`student_status:${approval.studentId}`)
  cache.del(`batch_status:${approval.batchId}`)
  cache.del(`faculty_pending:${approval.facultyId}:${approval.batchId}`)
  cache.del(`batch_summary:${approval.batchId}`)

  return newStatus
}
```

---

### 4.4 Cache Priming on Batch Initiation

When a batch is initiated, you know exactly what the initial state looks like (all pending). Prime the cache immediately so the first reads after initiation are all cache hits:

```javascript
// services/batchService.js — after bulkWrite completes
const primeCache = (batchId, students) => {
  const summary = {
    cleared: 0,
    pending: students.length,
    hasDues: 0,
    hodOverride: 0
  }

  cache.set(`batch_summary:${batchId}`, summary, 30)

  // Prime each student's status
  for (const student of students) {
    cache.set(`student_status:${student._id}`, {
      overallStatus: 'pending',
      approvals: student.approvals.map(a => ({ ...a, action: 'pending' }))
    }, 30)
  }
}
```

Now the first 650 students hitting `/api/student/status` right after batch initiation all get cache hits. Zero DB queries.

---

## 5. API Response Shaping

### 5.1 Return Only What the UI Renders

Audit every response against the actual UI. If the component doesn't render a field, don't return it.

**Student status page needs:**
```
rollNo, name, departmentName, semester, overallStatus,
per approval: subjectName, subjectCode, facultyName, approvalType, action, dueType, remarks, actionedAt
```

**Student status page does NOT need:**
```
_id of approvals (student can't act on them)
createdAt (not shown)
batchId (internal)
facultyId (internal)
studentId (they are the student)
__v
```

**Projected response:**
```javascript
// Build lean status response — only UI-relevant fields
const formatApproval = (a) => ({
  subjectName:  a.subjectName,
  subjectCode:  a.subjectCode,
  facultyName:  a.facultyName,
  approvalType: a.approvalType,
  action:       a.action,
  dueType:      a.dueType   || null,
  remarks:      a.remarks   || null,
  actionedAt:   a.actionedAt || null,
})
```

Smaller payload = faster serialization + faster network transfer + faster JSON.parse in browser.

---

### 5.2 Flatten Nested Data for List Views

Nested objects in list responses cause extra traversal in both serialization and frontend rendering:

```javascript
// ❌ Nested — harder to render, slightly heavier
{
  "student": {
    "rollNo": "21CSE001",
    "name": "Riya Sharma"
  },
  "status": "pending"
}

// ✅ Flat — direct field access, faster rendering
{
  "rollNo": "21CSE001",
  "studentName": "Riya Sharma",
  "status": "pending"
}
```

Apply this to list responses (batch grid, faculty pending list) where you're rendering 20–65 rows. Detail responses can stay nested since they're single objects.

---

### 5.3 Precompute Heavy Fields

The batch summary (cleared/pending/hasDues counts) is used on every admin page load. Don't aggregate it on every request — maintain it as a field:

```javascript
// Option A: Recompute via aggregation on every request (slow at peak)
const summary = await NodueRequest.aggregate([
  { $match: { batchId } },
  { $group: { _id: '$status', count: { $sum: 1 } } }
])

// Option B: Cache the aggregation result (fast)
const summary = await withCache(`batch_summary:${batchId}`, 30, async () => {
  const result = await NodueRequest.aggregate([...])
  return shapeSummary(result)
})

// Option C: Maintain counters on the batch document itself (fastest — zero DB query)
// Increment/decrement counters in the same update that changes request status
await NodueBatch.findByIdAndUpdate(batchId, {
  $inc: {
    'summary.pending': -1,
    'summary.cleared': +1
  }
})
```

For NDS at this scale, **Option B (cached aggregation)** is the sweet spot — simple to implement, fast enough, always accurate after cache TTL.

---

## 6. Bulk Operations

### 6.1 bulkWrite for Batch Initiation

Batch initiation creates ~520 documents (65 students × 8 faculty). Inserting them one by one would be 520 round trips to MongoDB. `bulkWrite` does it in one:

```javascript
// ❌ WRONG — 520 round trips
for (const student of students) {
  await NodueRequest.create({ ... })
  for (const faculty of snapshot) {
    await NodueApproval.create({ ... })
  }
}

// ✅ CORRECT — 1 round trip
const ops = []

for (const student of students) {
  const requestId = new mongoose.Types.ObjectId()

  ops.push({
    insertOne: {
      document: {
        _id: requestId,
        batchId,
        studentId: student._id,
        studentSnapshot: { rollNo: student.rollNo, name: student.name },
        facultySnapshot: buildSnapshot(classDoc, student),
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }
    }
  })

  for (const entry of buildSnapshot(classDoc, student)) {
    ops.push({
      insertOne: {
        document: {
          requestId,
          batchId,
          studentId: student._id,
          studentRollNo: student.rollNo,
          studentName: student.name,
          facultyId: entry.facultyId,
          subjectId: entry.subjectId || null,
          subjectName: entry.subjectName || null,
          approvalType: entry.approvalType,
          roleTag: entry.roleTag,
          action: 'pending',
          createdAt: now,
        }
      }
    })
  }
}

// Single round trip — all or partial depending on ordered flag
await mongoose.connection.db.collection('nodueapprovals').bulkWrite(ops, {
  ordered: false  // continue on individual errors, don't stop the whole operation
})
```

**Time difference:**  
- Sequential inserts: ~2,600ms (520 × 5ms per insert)  
- `bulkWrite`: ~80ms  

---

### 6.2 updateMany for Batch Operations

When closing a batch, don't update 65 requests one by one:

```javascript
// ❌ 65 separate updates
for (const requestId of requestIds) {
  await NodueRequest.findByIdAndUpdate(requestId, { status: 'closed' })
}

// ✅ Single update
await NodueRequest.updateMany(
  { batchId },
  { $set: { status: 'closed', updatedAt: new Date() } }
)
```

---

## 7. Connection & Server Optimization

### 7.1 Keep Render Warm (UptimeRobot)

Render's free tier sleeps after 15 minutes of inactivity. A cold start takes 10–30 seconds — catastrophic at peak load.

```
UptimeRobot → ping GET /api/health every 5 minutes
```

```javascript
// Lightweight health endpoint — no DB query, instant response
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})
```

The health check must return in <10ms. Don't query MongoDB inside it.

---

### 7.2 Database Connection on Server Start

Connect to MongoDB once when the server starts — not on the first request, not inside route handlers:

```javascript
// server.js
import { connectDB } from './config/db.js'

const start = async () => {
  await connectDB()          // ← connect BEFORE accepting requests
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

start()
```

With `minPoolSize: 2`, two connections are alive before the first request arrives.

---

### 7.3 Compression

Enable gzip compression on all responses. JSON payloads compress 60–80% — a 50KB batch grid response becomes 10KB:

```javascript
import compression from 'compression'

app.use(compression({
  level: 6,        // compression level 1-9 (6 = good balance)
  threshold: 1024, // only compress responses > 1KB
}))
```

Install: `npm install compression`

---

### 7.4 Response Caching Headers for Static-ish Responses

Some responses barely change. Tell the browser to cache them:

```javascript
// Subject list — almost never changes
app.get('/api/subjects', authenticate, async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=300')  // browser caches 5 min
  // ... rest of handler
})

// Student status — changes frequently, don't cache at browser level
app.get('/api/student/status', authenticate, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  // ... rely on server-side cache instead
})
```

---

### 7.5 Avoid Synchronous Operations in Route Handlers

Never block the event loop in a request handler:

```javascript
// ❌ Blocks event loop — all other requests wait
app.post('/api/import/students/commit', async (req, res) => {
  const file = req.file
  const workbook = XLSX.readFile(file.path)  // ← synchronous file read, blocks
  // ...
})

// ✅ Use async/stream approach
app.post('/api/import/students/commit', async (req, res) => {
  const buffer = req.file.buffer         // multer memory storage — already in memory
  const workbook = XLSX.read(buffer)     // read from buffer, not disk
  // ...
})
```

---

## 8. Frontend Data Fetching

### 8.1 Parallel Requests on Page Load

When a page needs multiple independent pieces of data, fetch them all at once:

```javascript
// ❌ Sequential — page load time = sum of all requests
const batch = await api.get(`/batch/${batchId}`)
const faculty = await api.get('/faculty')
const summary = await api.get(`/batch/${batchId}/summary`)

// ✅ Parallel — page load time = slowest single request
const [batch, faculty, summary] = await Promise.all([
  api.get(`/batch/${batchId}`),
  api.get('/faculty'),
  api.get(`/batch/${batchId}/summary`),
])
```

---

### 8.2 Optimistic Updates

Don't wait for the server to confirm an approval before updating the UI. Update immediately, then sync with server in background:

```javascript
// Faculty approves a student
const handleApprove = async (approvalId) => {
  // 1. Update UI immediately — no waiting
  setApprovals(prev =>
    prev.map(a => a.approvalId === approvalId
      ? { ...a, action: 'approved', actionedAt: new Date().toISOString() }
      : a
    )
  )

  try {
    // 2. Send to server in background
    await api.post('/approvals/approve', { approvalId })
  } catch (err) {
    // 3. Revert on failure
    setApprovals(prev =>
      prev.map(a => a.approvalId === approvalId
        ? { ...a, action: 'pending', actionedAt: null }
        : a
      )
    )
    toast.error('Action failed — please try again')
  }
}
```

The faculty sees instant feedback. The network round trip happens silently. This makes the UI feel instant even on slow connections.

---

### 8.3 SSE Instead of Polling

Polling (`setInterval` hitting the server every 5s) wastes bandwidth and creates DB load. SSE pushes only when data changes:

```javascript
// ❌ Polling — 12 requests/min per client × 650 clients = 7,800 requests/min at peak
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await api.get('/student/status')
    setStatus(status)
  }, 5000)
  return () => clearInterval(interval)
}, [])

// ✅ SSE — 0 requests until data changes, then instant push
useSSE({
  onApprovalUpdated: (event) => {
    if (event.studentId === currentStudentId) {
      // Update just the changed approval — no full refetch
      setApprovals(prev =>
        prev.map(a => a.approvalId === event.approvalId
          ? { ...a, action: event.action, overallStatus: event.overallStatus }
          : a
        )
      )
    }
  }
})
```

---

### 8.4 Local State Updates from SSE — No Refetch

When an SSE event arrives, update local state directly instead of refetching the whole resource:

```javascript
// ❌ Refetch on every SSE event — negates the benefit of SSE
es.addEventListener('approval_updated', async () => {
  const fresh = await api.get('/student/status')  // unnecessary round trip
  setStatus(fresh)
})

// ✅ Surgical state update from event payload
es.addEventListener('approval_updated', (e) => {
  const event = JSON.parse(e.data)
  setApprovals(prev =>
    prev.map(a =>
      a.approvalId === event.approvalId
        ? { ...a, action: event.action }
        : a
    )
  )
  setOverallStatus(event.overallStatus)
})
```

---

### 8.5 Debounce Search Inputs

Search endpoints hit the DB on every keystroke without debouncing:

```javascript
// ❌ Query fires on every keystroke
<input onChange={(e) => fetchStudents(e.target.value)} />

// ✅ Debounced — fires 300ms after user stops typing
import { useDeferredValue } from 'react'

const [search, setSearch] = useState('')
const deferredSearch = useDeferredValue(search)  // React 18 built-in

useEffect(() => {
  if (deferredSearch) fetchStudents(deferredSearch)
}, [deferredSearch])
```

Or with a manual debounce:
```javascript
import { useCallback } from 'react'
import debounce from 'lodash/debounce'

const fetchDebounced = useCallback(
  debounce((q) => api.get(`/students?search=${q}`), 300),
  []
)
```

---

### 8.6 Virtualize Long Lists

If you ever render 200+ items (all batch approvals for admin), don't render all DOM nodes at once. Only render what's visible:

```javascript
// For the batch status grid with 65 students × 8 columns
// Use windowing if it causes jank — though 65 rows should be fine without it
// If performance degrades, add:
import { FixedSizeList } from 'react-window'

<FixedSizeList
  height={600}
  itemCount={students.length}
  itemSize={52}
>
  {({ index, style }) => (
    <StudentRow style={style} student={students[index]} />
  )}
</FixedSizeList>
```

---

## 9. Peak Load Strategy

### 9.1 What Happens at Deadline

At semester-end deadline: 650 students simultaneously refresh `/api/student/status`. Without optimization this is 650 DB queries hitting MongoDB M0 simultaneously.

**With the cache strategy:**
- First student request: cache miss → DB query → cache set (30s TTL)
- Next 649 students within 30s: cache hit → 0 DB queries
- Every 30s: at most 650 DB queries (one per student on TTL expiry)
- In practice: staggered expiry means ~20 queries/second, well within M0 limits

**With SSE:**
- Students don't need to poll — server pushes on any change
- 650 persistent SSE connections use ~1MB RAM total on Render (negligible)

---

### 9.2 The Status Page is the Critical Path

`GET /api/student/status` is the single most hit endpoint. Optimize it specifically:

```javascript
// routes/studentPortal.js
router.get('/status', authenticate, roleGuard('student'), async (req, res) => {
  const studentId = req.user.userId
  const cacheKey = `student_status:${studentId}`

  // 1. Cache check — O(1) in-memory lookup
  const cached = cache.get(cacheKey)
  if (cached) {
    return res.json({ success: true, data: cached })
    // ↑ Returns in <1ms — no DB, no processing
  }

  // 2. Cache miss — build status
  // Find active batch for this student's class
  const student = await Student.findById(studentId)
    .select('rollNo name classId departmentId semester academicYear')
    .lean()

  const activeBatch = await NodueBatch.findOne({
    classId: student.classId,
    status: 'active'
  }).select('_id semester academicYear deadline').lean()

  if (!activeBatch) {
    const noStatus = { overallStatus: null, message: 'No active batch' }
    cache.set(cacheKey, noStatus, 60)
    return res.json({ success: true, data: noStatus })
  }

  // 3. Get request + approvals in parallel
  const [request, approvals] = await Promise.all([
    NodueRequest.findOne({ batchId: activeBatch._id, studentId })
      .select('status overriddenBy overrideRemark overriddenAt')
      .lean(),
    NodueApproval.find({ batchId: activeBatch._id, studentId })
      .select('subjectName subjectCode facultyName approvalType action dueType remarks actionedAt')
      .lean()
    // ↑ Both indexed queries — <5ms each
  ])

  // 4. Shape response
  const data = {
    rollNo: student.rollNo,
    name: student.name,
    departmentName: student.departmentName,
    semester: student.semester,
    academicYear: activeBatch.academicYear,
    overallStatus: request.status,
    deadline: activeBatch.deadline,
    overrideInfo: request.overriddenBy ? {
      overriddenBy: request.overriddenBy,
      overrideRemark: request.overrideRemark,
      overriddenAt: request.overriddenAt,
    } : null,
    approvals: approvals.map(a => ({
      subjectName:  a.subjectName,
      subjectCode:  a.subjectCode,
      facultyName:  a.facultyName,
      approvalType: a.approvalType,
      action:       a.action,
      dueType:      a.dueType || null,
      remarks:      a.remarks || null,
      actionedAt:   a.actionedAt || null,
    }))
  }

  // 5. Cache result
  cache.set(cacheKey, data, 30)

  return res.json({ success: true, data })
})
```

**Expected response time breakdown:**
- Cache hit: <1ms (in-memory object return)
- Cache miss: ~15–25ms (2 indexed DB queries in parallel)

---

### 9.3 Pre-warm Before Deadline

If you know the deadline is at 5 PM, add a scheduled job that pre-warms all student status caches at 4:55 PM:

```javascript
// services/prewarmService.js
export const prewarmStudentCaches = async (batchId) => {
  const requests = await NodueRequest.find({ batchId })
    .select('studentId status')
    .lean()

  const approvalsByRequest = await NodueApproval.find({ batchId })
    .select('studentId subjectName facultyName approvalType action dueType remarks actionedAt')
    .lean()

  // Group approvals by studentId
  const approvalMap = groupBy(approvalsByRequest, 'studentId')

  for (const request of requests) {
    const data = buildStatusResponse(request, approvalMap[request.studentId])
    cache.set(`student_status:${request.studentId}`, data, 300)  // 5 min TTL
  }

  console.log(`Pre-warmed ${requests.length} student status caches`)
}
```

Run this via a cron job or manually trigger from admin dashboard before deadline. All 650 students hit a warm cache.

---

## 10. Measuring & Debugging Slowness

### 10.1 Response Time Logging Middleware

Log every request's response time in development:

```javascript
// middleware/responseTime.js
export const responseTimeLogger = (req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    const flag = duration > 200 ? '🐢 SLOW' : duration > 100 ? '⚠️' : '✅'
    console.log(`${flag} ${req.method} ${req.path} — ${duration}ms`)
  })
  next()
}

// app.js — first middleware
app.use(responseTimeLogger)
```

Any endpoint consistently above 100ms needs investigation.

---

### 10.2 Identify Slow Queries with explain()

When a route is slow, add `.explain()` temporarily to find the culprit:

```javascript
const result = await NodueApproval.find({ batchId, action: 'pending' })
  .explain('executionStats')

console.log({
  stage:         result.queryPlanner.winningPlan.stage,
  docsExamined:  result.executionStats.totalDocsExamined,
  docsReturned:  result.executionStats.nReturned,
  durationMs:    result.executionStats.executionTimeMillis,
})
// If stage === "COLLSCAN" → you're missing an index
// If docsExamined >> nReturned → index isn't selective enough
```

---

### 10.3 The Performance Checklist

Run through this before shipping any new endpoint:

```
□ Does this query have an index on the filter fields?
□ Am I using .lean() on read-only queries?
□ Am I using .select() to project only needed fields?
□ Are independent DB queries running in parallel with Promise.all?
□ Is this response cached? What's the TTL? When does it invalidate?
□ Am I returning fields the frontend doesn't render?
□ Is the list paginated?
□ Does .explain() show IXSCAN (not COLLSCAN)?
□ Is the response < 50KB? (larger needs compression check)
```

---

### 10.4 Target Response Times for NDS

| Endpoint | Target | Acceptable |
|---|---|---|
| `GET /api/student/status` (cache hit) | <5ms | <10ms |
| `GET /api/student/status` (cache miss) | <30ms | <60ms |
| `GET /api/approvals/pending` | <40ms | <80ms |
| `GET /api/batch/:id` (batch grid) | <50ms | <100ms |
| `POST /api/approvals/approve` | <30ms | <60ms |
| `POST /api/batch/initiate` | <300ms | <600ms |
| `POST /api/import/students/commit` | <2000ms | <5000ms |
| `GET /api/auth/me` | <10ms | <20ms |

Anything above "Acceptable" needs investigation before it ships.

---

## Quick Reference — Priority Order

If you implement everything in this guide, start here and work down by impact:

```
1. ✅ Add all indexes (Section 2.1)          — biggest single impact
2. ✅ Use .lean() on all reads (Section 3.1) — easy, high impact
3. ✅ Implement node-cache (Section 4)        — critical for peak load
4. ✅ Promise.all for parallel queries (3.1)  — easy, consistent gains
5. ✅ Projection on all queries (2.2)         — reduces payload size
6. ✅ bulkWrite for batch initiation (6.1)    — required for correctness
7. ✅ SSE instead of polling (8.3)            — reduces server load
8. ✅ Optimistic updates on approvals (8.2)   — makes UI feel instant
9. ✅ Compression middleware (7.3)            — free network speedup
10. ✅ Pre-warm caches before deadline (9.3)  — insurance for peak
```

---

*End of API Performance Guide v1.0 — No-Due Clearance System, MITS*
