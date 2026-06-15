# NoDues — Digital Clearance Management System

> A production-grade, multi-role No-Dues clearance platform for engineering colleges. Students get real-time clearance status; faculty approve or mark dues; HoDs oversee their departments — all without a single sheet of paper.

**Live:** [nodues-arcclub.tech](https://nodues-arcclub.tech)

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [System Architecture](#system-architecture)
4. [Tech Stack](#tech-stack)
5. [Data Model](#data-model)
6. [Request Flow](#request-flow)
7. [Key Subsystems](#key-subsystems)
8. [API Reference (Summary)](#api-reference-summary)
9. [Deployment Architecture](#deployment-architecture)
10. [Problems We Faced & How We Solved Them](#problems-we-faced--how-we-solved-them)
11. [Environment Variables](#environment-variables)
12. [Local Development](#local-development)

---

## Problem Statement

Every semester, thousands of students in engineering colleges must collect physical "No-Dues" signatures from 10–15 faculty members (subject teachers, class teacher, mentor, HoD, library, etc.) before their results are released. This process is:

- **Slow** — students physically hunt down each faculty member
- **Opaque** — students have no idea which clearance is pending
- **Fragile** — paper slips get lost; faculty have no centralized record
- **Unscalable** — the admin has no real-time view of batch-level progress

**NoDues** replaces this entirely with a digital clearance workflow.

---

## Solution Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      NoDues Platform                         │
│                                                              │
│  ADMIN / HOD initiates a "Batch" for a class                │
│       │                                                      │
│       ▼                                                      │
│  System auto-generates NodueRequest + NodueApproval rows    │
│  for every student × every assigned faculty                  │
│       │                                                      │
│       ▼                                                      │
│  Faculty logs in → sees pending list → approves / marks due │
│       │                                                      │
│       ▼                                                      │
│  Status recalculated → Student sees live clearance status   │
│  via SSE (no refresh needed)                                 │
└─────────────────────────────────────────────────────────────┘
```

**Roles in the system:**

| Role | Capabilities |
|---|---|
| `admin` | Full access — manage users, departments, classes, initiate batches globally |
| `hod` | Department-scoped — initiate batches, view department progress, override clearances |
| `ao` | Same as HoD for administrative clearances |
| `faculty` | See own pending approvals, approve / mark due |
| `student` | View own clearance status in real-time; submit co-curricular proofs |

---

## System Architecture

```
┌──────────────────────┐         ┌──────────────────────────────────────┐
│                      │  HTTPS  │                                      │
│   React SPA          │◄───────►│   Express 5 API                      │
│   (Vercel CDN)       │         │   (Render — Dockerized)              │
│                      │         │                                      │
│  • React 19          │         │  ┌─────────────┐  ┌──────────────┐  │
│  • Vite 8            │         │  │  Auth Layer  │  │  Rate Limit  │  │
│  • TailwindCSS 4     │         │  │  (JWT+Cookie)│  │  (per-route) │  │
│  • React Query       │         │  └──────┬──────┘  └──────────────┘  │
│  • Framer Motion     │         │         │                            │
│  • Recharts          │         │  ┌──────▼──────────────────────┐    │
│                      │  SSE    │  │      Route Controllers       │    │
│   SSE EventSource ◄──┼─────────┼──│  auth / batch / approval /  │    │
│                      │         │  │  student / faculty / import  │    │
└──────────────────────┘         │  └──────┬──────────────────────┘    │
                                 │         │                            │
                                 │  ┌──────▼──────────────────────┐    │
                                 │  │     Mongoose ODM             │    │
                                 │  │  + batchSync.js (live sync) │    │
                                 │  └──────┬──────────────────────┘    │
                                 │         │                            │
                                 └─────────┼────────────────────────────┘
                                           │
                              ┌────────────▼────────────┐
                              │   MongoDB Atlas (M0)     │
                              │  • noduerequests         │
                              │  • nodueapprovals        │
                              │  • students / faculties  │
                              │  • batches / classes     │
                              │  • notifications         │
                              │  • emaillogs / tasks     │
                              └─────────────────────────┘
```

---

## Tech Stack

### Backend (`/server`)

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| Express | 5.x | HTTP framework |
| Mongoose | 9.x | MongoDB ODM |
| MongoDB Atlas | M0 | Primary database |
| JWT (jsonwebtoken) | 9.x | Stateless auth tokens |
| bcryptjs | 3.x | Password hashing |
| Winston | 3.x | Structured JSON logging |
| node-cache | 5.x | In-process LRU cache |
| nodemailer + Resend | 8.x / 6.x | Email delivery (multi-SMTP) |
| multer + xlsx | 2.x / 0.18 | Excel bulk import |
| zod | 4.x | Request schema validation |
| helmet | 8.x | HTTP security headers |
| compression | 1.x | Gzip for JSON responses |
| Docker | — | Container packaging |
| Nginx | — | Reverse proxy on Azure |

### Frontend (`/client`)

| Technology | Version | Purpose |
|---|---|---|
| React | 19.x | UI framework |
| Vite | 8.x | Build tool |
| TailwindCSS | 4.x | Utility-first styling |
| React Router | 7.x | Client-side routing |
| TanStack Query | 5.x | Server state, caching, invalidation |
| Axios | 1.x | HTTP client |
| Framer Motion | 12.x | Animations & transitions |
| Recharts | 3.x | Dashboard charts |
| Lucide React | 1.x | Icon library |
| react-hot-toast | 2.x | Toast notifications |

### Infrastructure

| Service | Role |
|---|---|
| Vercel | Frontend CDN + SPA hosting |
| Render | Backend Docker container hosting |
| MongoDB Atlas M0 | Free-tier database |
| GitHub Actions | CI/CD (planned) |

---

## Data Model

```
┌──────────────────────────────────────────────────────────────────┐
│                        Core Domain Model                          │
│                                                                    │
│  Department ──► Class ──► Student (many)                         │
│       │              │                                            │
│       │              └──► Faculty assignments (subjectAssignments)│
│       │                                                           │
│       └──► Faculty (roleTags: hod | ao | faculty)                │
│                                                                   │
│                                                                   │
│  ┌─── NodueBatch ───────────────────────────────────────┐        │
│  │  classId, departmentId, semester, academicYear        │        │
│  │  status: active | closed                              │        │
│  │  Unique index: { classId, status:'active' }           │        │
│  │  (prevents duplicate active batches per class)        │        │
│  └──────────────────────┬────────────────────────────────┘       │
│                         │  1:N                                    │
│  ┌──────────────────────▼────────────────────────────────┐       │
│  │  NodueRequest  (1 per student per batch)               │       │
│  │  studentId, batchId                                    │       │
│  │  studentSnapshot: { rollNo, name, departmentName }     │       │
│  │  facultySnapshot: { [subjectId | roleKey]: faculty }   │       │
│  │  status: pending | cleared | has_dues | hod_override   │       │
│  └──────────────────────┬────────────────────────────────┘       │
│                         │  1:N                                    │
│  ┌──────────────────────▼────────────────────────────────┐       │
│  │  NodueApproval  (1 per faculty×student per batch)      │       │
│  │  requestId, batchId, studentId, facultyId              │       │
│  │  approvalType: subject|classTeacher|mentor|coCurricular│       │
│  │  roleTag: faculty|classTeacher|mentor|hod|ao|...       │       │
│  │  action: pending|approved|due_marked|not_submitted     │       │
│  │  dueType: library|lab|fees|attendance|other            │       │
│  │  Unique: {requestId, facultyId, subjectId, roleTag}    │       │
│  └───────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Request Flow

### 1. Authentication Flow

```
Client                    Server                    MongoDB
  │                          │                         │
  │── POST /api/auth/login ──►│                         │
  │    { email, password }    │──── findOne(email) ────►│
  │                          │◄──── user doc ───────────│
  │                          │── bcrypt.compare ──────  │
  │                          │── jwt.sign(payload) ──   │
  │◄── 200 + Set-Cookie ─────│   (nds_token, httpOnly)  │
  │    { role, name, ... }   │                         │
```

**Student login** uses roll number only (no password) — the roll number itself is the credential, matching the college's physical ID card.

### 2. Batch Initiation Flow

```
HoD/Admin                 Server                         MongoDB
   │                         │                               │
   │─ POST /api/batch/init ─►│                               │
   │   { classId, deadline }  │─ Class.findOne(classId) ────►│
   │                         │─ Student.find({classId}) ────►│
   │                         │─ Faculty lookups (CT,mentors)►│
   │                         │─ CoCurricularType.find() ────►│
   │                         │                               │
   │                         │  [MongoDB Transaction]        │
   │                         │─ NodueBatch.create() ────────►│
   │                         │─ NodueRequest.bulkWrite() ───►│  (N students)
   │                         │─ NodueApproval.bulkWrite() ──►│  (N × M items)
   │                         │  [Commit]                     │
   │                         │                               │
   │                         │─ SSE pushEvent(studentIds) ──►│ (real-time notify)
   │◄─ 201 { batchId, ... } ─│                               │
```

### 3. Approval Flow (Faculty)

```
Faculty                   Server                         MongoDB + Cache
   │                         │                               │
   │─ POST /api/approvals ──►│                               │
   │   /approve              │─ NodueApproval.findOne() ────►│
   │   { approvalId }        │─ NodueBatch.findById() ──────►│
   │                         │  [Auth check: owns this row?] │
   │                         │  [MongoDB Transaction]        │
   │                         │─ approval.action = 'approved' │
   │                         │─ approval.save() ────────────►│
   │                         │─ recalcRequestStatus() ──────►│ (recalc cleared/dues)
   │                         │  [Commit]                     │
   │                         │─ invalidateStudentStatusCache │
   │                         │─ invalidateEntityCache()      │
   │                         │─ SSE pushEvent(studentId) ──  │
   │                         │─ createNotification() ───────►│
   │◄─ 200 { action:'ok' } ──│                               │
   │                         │                               │
   │  [Student's browser]    │                               │
   │◄─ SSE: APPROVAL_UPDATED ─                               │
   │  (dashboard auto-refresh)                               │
```

### 4. Real-time SSE Flow

```
Browser                      Server (SSE Controller)
   │                               │
   │─ GET /api/sse/connect ────────►│
   │   (EventSource, JWT cookie)   │── addClient(userId, res)
   │                               │── heartbeat every 15s
   │◄── event: connected ──────────│
   │                               │
   │  [Faculty approves elsewhere] │
   │◄── event: APPROVAL_UPDATED ───│── pushEvent([studentId], ...)
   │                               │
   │  React Query invalidates      │
   │  → UI updates instantly       │
```

---

## Key Subsystems

### `batchSync.js` — Live Sync Engine

The most complex piece of the codebase. When class data changes **while a batch is active**, this module propagates the changes atomically.

```
Trigger                     Action
─────────────────────────   ──────────────────────────────────────────
Subject faculty changed   → Update NodueApproval.facultyId + reset pending
Subject removed           → Delete NodueApproval rows + recalc status
Student mentor changed    → Update mentor approval + co-curricular rows
Student name/rollNo edit  → Update snapshots in Request + all Approvals
Student deactivated       → Delete active-batch rows (preserve history)
Elective added/removed    → Add/delete approval row + recalc
```

All operations use MongoDB sessions with a `safeTransaction` wrapper that gracefully handles M0 free-tier (no replica set) by falling back to non-transactional writes.

### Multi-SMTP Email Service

The college SMTP server has a ~300 emails/day cap. The email service rotates across multiple configured SMTP accounts, tracking daily usage per account in `EmailQuota` collection, and falls back to the next account when one is exhausted.

### In-process Cache

`node-cache` is used for hot-path reads:
- Department names (TTL: 1h)
- Class metadata (TTL: 1h)
- User profiles (TTL: 30s)
- Batch status grids (TTL: 60s)

Cache is invalidated via Mongoose post-save hooks on every model write, keeping the cache consistent without stale reads.

### Background Task Queue

Bulk operations (department-wide batch initiation) run as background Node.js async processes. A `Task` document tracks progress (0–100%). The frontend polls `/api/tasks/:id` to show a progress bar — no external queue needed at current scale.

---

## API Reference (Summary)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/login` | all | Staff login (email+password) |
| POST | `/api/auth/student-login` | public | Student login (roll number) |
| GET | `/api/auth/me` | all | Get current user profile |
| POST | `/api/auth/logout` | all | Clear session cookie |
| GET | `/api/health` | public | Health check |
| GET | `/api/batch` | admin/hod/ao | List all batches |
| POST | `/api/batch/initiate` | admin/hod/ao | Start a batch for a class |
| POST | `/api/batch/initiate-department` | hod/ao | Bulk-initiate all classes |
| GET | `/api/batch/:id` | admin/hod/ao | Batch status grid |
| POST | `/api/batch/:id/close` | admin/hod/ao | Close batch |
| GET | `/api/approvals/pending` | faculty/hod | Pending approvals list |
| POST | `/api/approvals/approve` | faculty/hod | Approve a clearance |
| POST | `/api/approvals/mark-due` | faculty/hod | Mark a due |
| POST | `/api/approvals/bulk-approve` | faculty/hod | Bulk approve |
| GET | `/api/student/status` | student | Own clearance status |
| GET | `/api/sse/connect` | all | SSE event stream |
| POST | `/api/import/students` | admin | Bulk import via Excel |
| GET | `/api/notifications` | all | In-app notifications |

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Production Deployment                     │
│                                                               │
│  ┌────────────────────┐        ┌────────────────────────┐   │
│  │  Vercel (Global CDN)│        │  Render (Oregon)        │   │
│  │                    │        │                        │   │
│  │  React SPA         │        │  Docker Container      │   │
│  │  Static files      │        │  Node.js 20            │   │
│  │                    │        │  Port 5000             │   │
│  │  vercel.json:      │        │                        │   │
│  │  /api/* ──────────►│──HTTPS►│  /api/*                │   │
│  │  /* → index.html   │        │                        │   │
│  └────────────────────┘        └──────────┬─────────────┘   │
│                                           │                   │
│                                ┌──────────▼─────────────┐   │
│                                │  MongoDB Atlas M0       │   │
│                                │  (Free tier, shared)   │   │
│                                └────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Docker container details:**
- Base image: `node:20-bookworm-slim`
- Runs as non-root user `nodues`
- Health check: `GET /api/health` every 30s
- Memory cap: `--max-old-space-size=1024` (1 GB)
- `NODE_ENV=production` baked in

---

## Problems We Faced & How We Solved Them

### 1. MongoDB Atlas M0 — No Transactions

**Problem:** MongoDB Atlas free tier (M0) runs on shared clusters without replica sets. Mongoose `session.withTransaction()` throws `MongoServerError: Transaction numbers are only allowed on a replica member`.

**Solution:** Built a `safeTransaction.js` wrapper. It attempts to start a transaction; if the server doesn't support it, it silently falls back to non-transactional writes. Risky writes (batch initiation, approval actions) are ordered so that the most critical write happens first, reducing the blast radius of a partial failure.

```js
// safeTransaction.js — detects replica set support at runtime
export const startSafeTransaction = async (session) => {
  try {
    session.startTransaction();
  } catch (e) {
    if (e.message.includes('replica')) return; // M0 fallback
    throw e;
  }
};
```

---

### 2. Live Sync — Class Data Changing Mid-Batch

**Problem:** After a batch is initiated, the admin sometimes changes a subject's faculty or a student's mentor. The already-created `NodueApproval` rows still point to the old faculty — creating ghost approvals the old faculty can't clear.

**Solution:** `batchSync.js` — a suite of transactional sync functions called as side effects from every write controller. Any change to class subjects, student mentor, or elective enrolment propagates atomically to all active-batch approval rows, updating `facultyId` and resetting the action to `pending` so the new faculty sees it immediately.

---

### 3. CORS — Vercel Frontend → Render Backend

**Problem:** Cross-origin requests from `nodues-arcclub.tech` (Vercel) to `nodues-jbzp.onrender.com` (Render) were blocked. The initial wildcard CORS config worked locally but the cookie `SameSite=None; Secure` flag caused the auth cookie to be silently dropped on the cross-site request.

**Solution:**
- Backend: `cors()` middleware with explicit origin whitelist including regex patterns for Vercel preview URLs
- Vercel `rewrites` to proxy `/api/*` directly to the Render backend URL — this makes the request same-origin from the browser's perspective, removing the cross-origin cookie issue entirely
- Cookie: `SameSite=none; Secure` in production, `SameSite=lax` in dev

---

### 4. SSE Buffering Behind Nginx

**Problem:** Server-Sent Events were getting buffered by Nginx on the Azure VM deployment, causing multi-second delays before the browser received events, defeating the purpose of real-time updates.

**Solution:** Added `X-Accel-Buffering: no` response header, which is the Nginx-specific directive to disable proxy buffering for that response. Combined with `Cache-Control: no-cache` and `Connection: keep-alive` headers plus a 15-second heartbeat comment (`": heartbeat\n\n"`) to prevent proxy timeout disconnects.

---

### 5. Database Connectivity — Neon/Supabase Pooler vs Direct

**Problem:** Early prototype used a Neon PostgreSQL connection string with PgBouncer pooler (`?pgbouncer=true`). Prisma queries were failing with P1001 (connection refused) intermittently. Migration to MongoDB was planned but the pooler URL caused issues even during the transition.

**Solution:** Switched to the direct database endpoint (bypassing the pooler). For MongoDB Atlas, ensured the connection string used the standard `mongodb+srv://` SRV record with Mongoose's built-in connection pool (default 5 connections) rather than the `mongodb+prisma://` accelerate proxy.

---

### 6. Cache Invalidation — O(n) Key Scan

**Problem:** The original cache invalidation logic iterated all keys in node-cache with `.keys()` and filtered by prefix (e.g., `batch_status:*`). At 500+ cached keys this became an O(n) scan on every approval action — measurable latency spike.

**Solution:** Switched to direct targeted deletes. Every cacheable entity has a deterministic key pattern (`batch_status:{batchId}`, `user:{userId}`, `dept:{departmentId}`). On write, only the specific key is deleted — no scanning. Mongoose post-save hooks on each model trigger `invalidateEntityCache()` automatically.

---

### 7. Approval Uniqueness — Duplicate Rows on Retry

**Problem:** Network retries on the frontend (React Query retries failed mutations) could POST an approval action twice. The second call would create a duplicate `NodueApproval` document with a different `_id`.

**Solution:** Compound unique index on `NodueApproval`:
```js
{ requestId: 1, facultyId: 1, subjectId: 1, roleTag: 1, itemTypeId: 1 }
```
Any duplicate insert throws `MongoServerError: E11000 duplicate key`. The controller catches this and returns `409 APPROVAL_ALREADY_ACTIONED` — which React Query treats as a success (the state is correct). The unique index is also the primary performance index for the student status recalculation query.

---

### 8. Bulk Import — Excel Roll Number Conflicts

**Problem:** Importing 400+ students from Excel `.xlsx` files sometimes had duplicate roll numbers between the sheet and the existing DB, or between rows in the same sheet. The first failure aborted the entire import, losing all previous work.

**Solution:** The import controller uses `bulkWrite` with `ordered: false` and catches `BulkWriteError`. Successful inserts are committed; only conflicting rows are reported back to the admin with the specific roll number and reason. The admin sees a per-row import result table.

---

### 9. Batch Status Drift — `recalcRequestStatus` Consistency

**Problem:** After bulk approve operations, the `NodueRequest.status` field (derived: `pending | cleared | has_dues`) could go stale if the recalculation query ran before the approval rows were fully written.

**Solution:** `recalcRequestStatus()` reads all `NodueApproval` rows for a given `requestId` using the same Mongoose session as the approval write — so it always reads the just-committed state. For bulk operations, `bulkRecalcRequestStatus()` batches the recalculation in a single `find` + `updateMany` aggregation rather than N individual queries.

---

## Environment Variables

### Backend (`server/.env`)

```bash
# Database
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/nodues

# Auth
JWT_SECRET=<32+ char random string>
JWT_EXPIRE=8h
SUPER_PASS=<emergency master password>

# Server
PORT=5000
NODE_ENV=production
CLIENT_URL=https://nodues-arcclub.tech

# Email (add SMTP_USER_2, SMTP_PASS_2 ... for rotation)
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=<app-password>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_DAILY_LIMIT=300

# Resend (fallback)
RESEND_API_KEY=re_xxxx
```

### Frontend (`client/.env`)

```bash
VITE_API_URL=https://nodues-jbzp.onrender.com
```

---

## Local Development

### Prerequisites
- Node.js 20+
- MongoDB running locally **or** a MongoDB Atlas connection string

### Backend

```bash
cd server
cp .env.example .env        # fill in your values
npm install
npm run dev                 # nodemon server.js, port 5000
```

Seed the first admin:
```bash
npm run db:seed:admin
```

### Frontend

```bash
cd client
npm install
npm run dev                 # Vite dev server, port 5173
```

### Docker (production-like)

```bash
cd server
docker build -t nodues-server .
docker run -p 5000:5000 --env-file .env nodues-server
```

---

## Project Structure

```
NoDues/
├── client/                    # React SPA
│   ├── src/
│   │   ├── api/               # Axios request helpers
│   │   ├── components/        # Shared UI components
│   │   ├── context/           # Auth context
│   │   ├── hooks/             # Custom React hooks
│   │   ├── pages/
│   │   │   ├── admin/         # Admin portal
│   │   │   ├── faculty/       # Faculty dashboard
│   │   │   ├── hod/           # HoD overview
│   │   │   └── student/       # Student clearance portal
│   │   └── App.jsx            # Routes & role guards
│   └── vercel.json            # Vercel rewrite rules
│
└── server/                    # Express API
    ├── src/
    │   ├── Controllers/       # Route handlers (16 controllers)
    │   ├── Routes/            # Express routers (16 route files)
    │   ├── models/            # Mongoose schemas (15 models)
    │   ├── middlewares/       # auth, errorHandler, rateLimiter
    │   ├── services/          # emailService.js
    │   ├── utils/
    │   │   ├── batchSync.js   # Live sync engine
    │   │   ├── cacheHooks.js  # Cache invalidation helpers
    │   │   ├── logger.js      # Winston structured logger
    │   │   ├── safeTransaction.js  # M0-compatible tx wrapper
    │   │   └── withCache.js   # Cache read-through helper
    │   ├── config/
    │   │   └── cache.js       # node-cache singleton
    │   └── app.js             # Express app setup
    ├── server.js              # Entry point (DB connect + listen)
    └── Dockerfile
```

---

*Built by the ARC Club, Hyderabad — 2025/26*