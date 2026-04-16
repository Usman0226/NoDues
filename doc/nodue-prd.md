# No-Due Clearance System
## Product Requirements Document — v4.0 (Final)

**Project:** No-Due Clearance System (NDS)  
**Departments:** CSE & ECE — MITS Deemed to be University  
**Author:** Usman (IIC Innovation Coordinator)  
**Version:** 4.0 — Final, All Decisions Locked  
**Date:** April 2026  
**Status:** Ready for Development

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Roles & Permissions](#2-roles--permissions)
3. [System Architecture](#3-system-architecture)
4. [Database Architecture](#4-database-architecture)
5. [Backend PRD](#5-backend-prd)
6. [Frontend PRD](#6-frontend-prd)
7. [No-Due Generation Flow](#7-no-due-generation-flow)
8. [Data Import Strategy](#8-data-import-strategy)
9. [Real-Time Strategy](#9-real-time-strategy)
10. [Email & Credential System](#10-email--credential-system)
11. [Tech Stack](#11-tech-stack)
12. [Non-Goals v1](#12-non-goals-v1)
13. [Risks & Mitigations](#13-risks--mitigations)

---

## 1. Project Overview

### Problem Statement

The current no-due clearance process at MITS is entirely paper-based. At the end of every semester, office staff print individual no-due forms for each student — 60–70 per class, across 10 classes — and physically route them to every subject faculty, class teacher, mentor, and HoD for signature. This results in lost forms, delays caused by absent faculty, no real-time visibility for students or admin, repetitive manual effort every semester, and no historical audit trail.

### Solution

A role-based web application that digitalises the entire no-due workflow. Admin or HoD initiates batch clearance requests per class. Every faculty assigned to that class approves or flags dues for every student they are responsible for. The department HoD must also approve every student individually as a normal approver in the clearance chain, separate from override. Students get a real-time status view using only their roll number. HoD override remains a separate exception flow used only when a student is blocked by marked dues. All actions are timestamped and stored permanently.

### Scale

- ~650 students across 10 classes (2 departments)
- ~30 faculty members
- Peak concurrent users: 650+ at semester-end deadline
- Trigger: End of every semester (2× per year)

---

## 2. Roles & Permissions

| Role | Login Method | Scope | Key Capabilities |
|---|---|---|---|
| **Admin** | Email + Password | Global (both departments) | Full CRUD on all data; initiate batches; view all status |
| **HoD** | Email + Password | Own department only | Same as Admin but scoped to their department; approves every student individually and can override blocked clearances |
| **Faculty** | Email + Password (emailed) | Assigned classes only | View all students in assigned class; approve or mark due per subject/role |
| **Student** | Roll Number only | Own records only | Read-only: own no-due status for current semester |

> Faculty is a single role. Class Teacher, Mentor, and HoD are **role tags** on the Faculty model — the same person can hold multiple tags simultaneously. A faculty member tagged as HoD gets both a faculty login and HoD-scoped management access.

### Permission Matrix

| Action | Admin | HoD | Faculty | Student |
|---|---|---|---|---|
| Create/manage departments | ✅ | ❌ | ❌ | ❌ |
| Create/manage classes | ✅ | ✅ (own dept) | ❌ | ❌ |
| Create/manage faculty accounts | ✅ | ✅ (own dept) | ❌ | ❌ |
| Import/manage students | ✅ | ✅ (own dept) | ❌ | ❌ |
| Assign subjects to classes | ✅ | ✅ (own dept) | ❌ | ❌ |
| Assign electives to students | ✅ | ✅ (own dept) | ❌ | ❌ |
| Assign mentors to students | ✅ | ✅ (own dept) | ❌ | ❌ |
| Initiate no-due batch | ✅ | ✅ (own dept) | ❌ | ❌ |
| Approve / mark due as required approver | ❌ | ✅ (mandatory HoD approval + any faculty-role approvals) | ✅ | ❌ |
| Override blocked clearance | ❌ | ✅ (own dept) | ❌ | ❌ |
| View department no-due overview | ✅ | ✅ (own dept) | ❌ | ❌ |
| View own no-due status | ❌ | ❌ | ❌ | ✅ |

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                        │
│   React 18 + Vite  →  Vercel                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │  Admin   │  │  HoD     │  │ Faculty  │  │ Student │  │
│  │  Portal  │  │  Portal  │  │  Portal  │  │  View   │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘  │
└──────────────────────────┬───────────────────────────────┘
                           │ HTTPS + SSE
┌──────────────────────────▼───────────────────────────────┐
│                      SERVER LAYER                        │
│   Express.js  →  Render (free) + UptimeRobot            │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  REST API  │  SSE Manager  │  JWT Auth  │  Cache    │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Batch Engine  │  Import Service  │  Email Service  │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────┘
                           │ Mongoose (pool: 10)
┌──────────────────────────▼───────────────────────────────┐
│                      DATA LAYER                          │
│   MongoDB Atlas M0 + node-cache                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │departments│ │ subjects │ │ classes  │ │  faculty   │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├────────────┤  │
│  │ students │ │  batches │ │ requests │ │ approvals  │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │
└──────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│                   EXTERNAL SERVICES                      │
│   Resend (Email)     UptimeRobot (Keepalive ping)       │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Database Architecture

### Design Principles

- **Class is the structural hub.** Core subject assignments and class teacher live on the class document.
- **Student is the individual hub.** Mentor and elective assignments are per-student — not per-class.
- **Snapshot at request level.** Each `nodueRequest` carries its own `facultySnapshot` — the exact set of required approvers for that specific student, frozen at batch initiation. This handles varying electives and mentors cleanly.
- **Denormalize for read speed.** Student roll number, name, subject name, and faculty name are baked into snapshot and approval documents. Zero joins needed during peak-load status queries.
- **Approve per subject + role.** A faculty member appearing in multiple roles (e.g. subject teacher + class teacher) generates separate approval records — one per `{ facultyId, subjectId, roleTag }` combination.

---

### 4.1 Collection: `departments`

```json
{
  "_id": "ObjectId",
  "name": "CSE | ECE",
  "hodId": "ObjectId → faculty",
  "createdAt": "Date"
}
```

---

### 4.2 Collection: `admins`

```json
{
  "_id": "ObjectId",
  "name": "String",
  "email": "String (unique)",
  "passwordHash": "String",
  "mustChangePassword": "Boolean",
  "isSuperAdmin": "Boolean",
  "createdAt": "Date"
}
```

> Admins have global access. No departmentId scoping needed.

---

### 4.3 Collection: `subjects`

```json
{
  "_id": "ObjectId",
  "name": "Database Management Systems",
  "code": "CS501",
  "semester": 5,
  "isElective": false,
  "createdAt": "Date"
}
```

> Subjects are **global** — no `departmentId`. A subject like "Engineering Mathematics" or "Aptitude" is shared across CSE, ECE, CSD, and any other department. The department context is established at the class level via `subjectAssignments`, not at the subject level. `code` is a reference/default code only — it can be overridden per class assignment if the subject carries a different code in different departments. `isElective: true` marks open elective subjects (3rd year and above).

---

### 4.4 Collection: `faculty`

```json
{
  "_id": "ObjectId",
  "name": "String",
  "email": "String (unique)",
  "phone": "String",
  "employeeId": "String (unique)",
  "passwordHash": "String",
  "mustChangePassword": true,
  "departmentId": "ObjectId → department",
  "roleTags": ["faculty", "classTeacher", "mentor", "hod"],
  "isActive": "Boolean",
  "createdAt": "Date",
  "lastLoginAt": "Date"
}
```

> `roleTags` is an array — a single faculty can hold multiple roles simultaneously. HoD is a roleTag here; the `departments.hodId` field points to the same faculty document.

---

### 4.5 Collection: `classes`

```json
{
  "_id": "ObjectId",
  "name": "CSE-A Sem 5",
  "departmentId": "ObjectId → department",
  "semester": 5,
  "academicYear": "2025-26",
  "classTeacherId": "ObjectId → faculty",
  "subjectAssignments": [
    {
      "subjectId": "ObjectId → subject",
      "subjectName": "String (denormalized)",
      "subjectCode": "String (overrides subject default code if different per dept)",
      "facultyId": "ObjectId → faculty",
      "facultyName": "String (denormalized)"
    }
  ],
  "studentIds": ["ObjectId → student"],
  "isActive": "Boolean",
  "createdAt": "Date"
}
```

> `subjectAssignments` holds **core subjects only** — subjects that apply to all students in the class. Open electives live on individual student documents. `mentorId` is NOT here — it lives on each student.
>
> **Multi-section handling:** When the same department has multiple sections (e.g. CSD-A through CSD-E), each section is a separate class document. All sections can reference the same `subjectId` entries in their `subjectAssignments` but with different `facultyId` values per section. This means the same subject (e.g. Maths) is taught by different faculty per section — handled cleanly at the class level with no schema changes.
>
> **Subject code override:** If a subject carries a different code across departments (e.g. Maths is `MA301` in CSE and `MA302` in ECE), the `subjectCode` field in `subjectAssignments` overrides the default code stored on the subject document. If left blank, falls back to `subject.code`.

---

### 4.6 Collection: `students`

```json
{
  "_id": "ObjectId",
  "rollNo": "String (unique, globally)",
  "name": "String",
  "email": "String",
  "classId": "ObjectId → class",
  "departmentId": "ObjectId → department",
  "semester": "Number",
  "academicYear": "String",
  "yearOfStudy": "Number (1-4)",
  "mentorId": "ObjectId → faculty",
  "electiveSubjects": [
    {
      "subjectId": "ObjectId → subject",
      "subjectName": "String (denormalized)",
      "subjectCode": "String (denormalized)",
      "facultyId": "ObjectId → faculty",
      "facultyName": "String (denormalized)"
    }
  ],
  "isActive": "Boolean",
  "createdAt": "Date"
}
```

> No `passwordHash` or `mustChangePassword` — students log in with roll number only. `mentorId` is per-student because different students in the same class have different mentors (assigned by roll number range or individually). `electiveSubjects` is per-student for 3rd year and above.

---

### 4.7 Collection: `nodueBatches`

```json
{
  "_id": "ObjectId",
  "classId": "ObjectId → class",
  "className": "String (denormalized)",
  "departmentId": "ObjectId → department",
  "semester": "Number",
  "academicYear": "String",
  "initiatedBy": "ObjectId → admin or faculty (HoD)",
  "initiatedByRole": "admin | hod",
  "initiatedAt": "Date",
  "deadline": "Date (optional)",
  "status": "active | closed",
  "totalStudents": "Number",
  "createdAt": "Date"
}
```

> Batch is now **metadata only**. No `facultySnapshot` here — it lives on each `nodueRequest` because every student has a potentially different approver set (different mentors, different electives).

---

### 4.8 Collection: `nodueRequests`

```json
{
  "_id": "ObjectId",
  "batchId": "ObjectId → nodueBatch",
  "studentId": "ObjectId → student",
  "studentSnapshot": {
    "rollNo": "String",
    "name": "String",
    "departmentName": "String"
  },
  "facultySnapshot": [
    {
      "facultyId": "ObjectId",
      "facultyName": "String",
      "subjectId": "ObjectId | null",
      "subjectName": "String | null",
      "subjectCode": "String | null",
      "roleTag": "faculty | classTeacher | mentor | hod",
      "approvalType": "subject | classTeacher | mentor | hodApproval"
    }
  ],
  "status": "pending | cleared | has_dues | hod_override",
  "overriddenBy": "ObjectId → faculty (HoD)",
  "overrideRemark": "String",
  "overriddenAt": "Date",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

> `facultySnapshot` is **student-specific** — built at batch initiation from:
> - `class.subjectAssignments` → core subject entries (approvalType: "subject")
> - `student.electiveSubjects` → elective entries (approvalType: "subject")
> - `class.classTeacherId` → one entry (approvalType: "classTeacher", subjectId: null)
> - `student.mentorId` → one entry (approvalType: "mentor", subjectId: null)
> - `department.hodId` → one entry per student (approvalType: "hodApproval", subjectId: null)

---

### 4.9 Collection: `nodueApprovals`

```json
{
  "_id": "ObjectId",
  "requestId": "ObjectId → nodueRequest",
  "batchId": "ObjectId → nodueBatch",
  "studentId": "ObjectId → student",
  "studentRollNo": "String (denormalized)",
  "studentName": "String (denormalized)",
  "facultyId": "ObjectId → faculty",
  "subjectId": "ObjectId | null",
  "subjectName": "String | null",
  "approvalType": "subject | classTeacher | mentor | hodApproval",
  "roleTag": "faculty | classTeacher | mentor | hod",
  "action": "pending | approved | due_marked",
  "dueType": "library | lab | fees | attendance | other | null",
  "remarks": "String | null",
  "actionedAt": "Date | null",
  "createdAt": "Date"
}
```

---

### 4.10 Indexes

```javascript
// nodueApprovals — most critical, highest query volume at peak
nodueApprovals.createIndex(
  { requestId: 1, facultyId: 1, subjectId: 1, roleTag: 1 },
  { unique: true }
)
nodueApprovals.createIndex({ batchId: 1, facultyId: 1, action: 1 })
nodueApprovals.createIndex({ batchId: 1, action: 1 })
nodueApprovals.createIndex({ studentId: 1, batchId: 1 })
nodueApprovals.createIndex({ facultyId: 1, action: 1 })

// nodueRequests
nodueRequests.createIndex({ batchId: 1, status: 1 })
nodueRequests.createIndex({ studentId: 1 })
nodueRequests.createIndex({ batchId: 1, "studentSnapshot.rollNo": 1 })

// students
students.createIndex({ rollNo: 1 }, { unique: true })
students.createIndex({ classId: 1 })
students.createIndex({ mentorId: 1 })

// faculty
faculty.createIndex({ email: 1 }, { unique: true })
faculty.createIndex({ employeeId: 1 }, { unique: true })
faculty.createIndex({ departmentId: 1, roleTags: 1 })

// subjects
subjects.createIndex({ code: 1 }, { unique: true })
subjects.createIndex({ semester: 1, isElective: 1 })
```

---

### 4.11 Status Computation Logic

```
Per nodueRequest, compute status from its nodueApprovals:

IF overriddenBy is set
  → status = "hod_override"  (terminal, bypasses all other logic)

ELSE IF any approval.action === "due_marked"
  → status = "has_dues"

ELSE IF all approvals.action === "approved"
  → status = "cleared"

ELSE
  → status = "pending"
```

Status is **computed and saved** on every approval action — never computed on-the-fly at query time. This prevents expensive aggregations during peak load.

---

### 4.12 Edge Cases — Confirmed Handling

| Edge Case | Handling |
|---|---|
| Same faculty teaches 2 subjects in class | 2 separate approval records (one per subject) |
| Class teacher also teaches a subject | 2 records: one as subject faculty, one as classTeacher |
| HoD teaches a subject | 2 records: subject approval + separate override authority |
| Mentor assigned individually per student | `student.mentorId` — not on class |
| 3rd year student with open elective | `student.electiveSubjects[]` — not on class |
| Same subject shared across departments (e.g. Maths, Aptitude) | Single subject document in global subjects collection; `subjectCode` overridden per class assignment if code differs per dept |
| Multiple sections with same subjects (e.g. CSD-A to CSD-E) | Each section is a separate class document; same `subjectId` referenced across all, different `facultyId` per section; completely isolated approval chains per batch |
| Faculty teaching same subject across multiple sections | Appears in pending list for all sections simultaneously; batch selector on faculty portal groups by class |
| Student added after batch initiated | Admin manually adds student to active batch; approvals generated fresh for that student from the same subject assignments |
| Faculty removed from active batch | Their pending approval records deleted; actioned records retained for audit |
| Duplicate roll number on import | Caught in preview step via unique index check; row marked as error |
| Active batch already exists for class+semester+year | Server returns 409 — hard block on duplicate initiation |
| No students in class at batch initiation | Server returns 400 — hard block |
| No subject assignments in class at batch initiation | Server returns 400 — hard block |
| No class teacher assigned at batch initiation | Server returns 400 — hard block |

---

## 5. Backend PRD

### 5.1 Project Structure

```
/server
  /config
    db.js              — Mongoose connection, pool size 10
    resend.js          — Resend email client init
    cache.js           — node-cache instance (TTLs defined here)
  /middleware
    auth.js            — JWT verification, attach user to req
    roleGuard.js       — Role + department scope enforcement
    deptScope.js       — Auto-filter queries by dept for HoD
    errorHandler.js    — Global error handler, consistent error shape
  /models
    Admin.js
    Faculty.js
    Student.js
    Department.js
    Subject.js
    Class.js
    NodueBatch.js
    NodueRequest.js
    NodueApproval.js
  /routes
    auth.js
    departments.js
    subjects.js
    classes.js
    faculty.js
    students.js
    batch.js
    approvals.js
    hod.js
    studentPortal.js
    import.js
    sse.js
  /services
    batchService.js      — Batch initiation, facultySnapshot builder
    statusService.js     — Status recomputation after every approval
    emailService.js      — Credential emails via Resend
    sseService.js        — SSE connection map manager
    importService.js     — XLSX/CSV parsing, validation, bulk write
    credentialService.js — Auto-generate credentials
  /utils
    validators.js
    formatters.js
    constants.js         — Due types, role tags, error codes
  app.js
  server.js
```

---

### 5.2 Authentication & Authorization

#### Two Login Flows

**Admin / Faculty Login**
```
POST /api/auth/login
Body: { email, password }
Response: JWT in httpOnly cookie
Payload: { userId, role: "admin|faculty|hod", departmentId, roleTags[] }
```

**Student Login**
```
POST /api/auth/student-login
Body: { rollNo }
Response: JWT in httpOnly cookie
Payload: { userId, role: "student", rollNo }
```
> No password for students. Roll number is the sole identifier. Anyone with the roll number can view that student's status — acceptable for an internal clearance tool.

#### JWT Config
- Expiry: 8 hours
- Storage: `httpOnly` cookie (not localStorage)
- Refresh: re-login required

#### Password Policy (Admin + Faculty only)
- Auto-generated format: `{employeeId}@Mits#{4-digit-random}` e.g. `EMP042@Mits#3916`
- Bcrypt hashing, salt rounds: 10
- `mustChangePassword: true` on creation → any request except `/change-password` returns 403 until changed

#### Department Scope Middleware (`deptScope.js`)
- Applied to all HoD routes
- Injects `{ departmentId: req.user.departmentId }` into every query filter automatically
- HoD cannot access, modify, or view data outside their department

---

### 5.3 API Routes

#### Auth — `/api/auth`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/login` | Public | Admin/Faculty login |
| POST | `/student-login` | Public | Student login with roll number |
| POST | `/change-password` | Authenticated | Force change on first login |
| POST | `/logout` | Authenticated | Clear JWT cookie |
| GET | `/me` | Authenticated | Current user profile |

---

#### Departments — `/api/departments`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Admin | List all departments |
| POST | `/` | Admin | Create department |
| GET | `/:id` | Admin, HoD | Get department detail |
| PATCH | `/:id` | Admin | Update (name, hodId) |

---

#### Subjects — `/api/subjects`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Admin, HoD | List subjects (filter: dept, semester, isElective) |
| POST | `/` | Admin, HoD | Create subject |
| GET | `/:id` | Admin, HoD | Subject detail |
| PATCH | `/:id` | Admin, HoD | Update subject |
| DELETE | `/:id` | Admin, HoD | Soft delete |

---

#### Classes — `/api/classes`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Admin, HoD | List classes (filter: dept, semester, year) |
| POST | `/` | Admin, HoD | Create class |
| GET | `/:id` | Admin, HoD | Class detail: metadata + subjectAssignments + student list |
| PATCH | `/:id` | Admin, HoD | Update class metadata |
| DELETE | `/:id` | Admin, HoD | Soft delete |
| POST | `/:id/subjects` | Admin, HoD | Add subject assignment `{ subjectId, facultyId, subjectCode? }` |
| PATCH | `/:id/subjects/:subjectId` | Admin, HoD | Reassign faculty or update subjectCode override |
| DELETE | `/:id/subjects/:subjectId` | Admin, HoD | Remove subject from class |
| PATCH | `/:id/class-teacher` | Admin, HoD | Assign/change class teacher |
| POST | `/:id/clone-subjects` | Admin, HoD | Copy subject list from another class `{ sourceClassId }` — copies subjectIds, clears facultyIds for reassignment |

---

#### Faculty — `/api/faculty`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Admin, HoD | List faculty (filter: dept, roleTag) |
| POST | `/` | Admin, HoD | Create faculty → credential email sent |
| GET | `/:id` | Admin, HoD | Faculty detail |
| PATCH | `/:id` | Admin, HoD | Update (name, email, roleTags, etc.) |
| DELETE | `/:id` | Admin, HoD | Soft delete |
| GET | `/:id/classes` | Admin, HoD | Classes this faculty is assigned to |

---

#### Students — `/api/students`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Admin, HoD | List students (filter: class, dept, semester) |
| POST | `/` | Admin, HoD | Create single student |
| GET | `/:id` | Admin, HoD | Student detail + current no-due status |
| PATCH | `/:id` | Admin, HoD | Update student details |
| DELETE | `/:id` | Admin, HoD | Soft delete |
| PATCH | `/:id/mentor` | Admin, HoD | Assign/change mentor `{ mentorId }` |
| POST | `/:id/electives` | Admin, HoD | Add elective `{ subjectId, facultyId }` |
| PATCH | `/:id/electives/:subjectId` | Admin, HoD | Reassign elective faculty |
| DELETE | `/:id/electives/:subjectId` | Admin, HoD | Remove elective |

---

#### Import — `/api/import`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/students/preview` | Admin, HoD | Upload XLSX/CSV → parse, validate → return preview with errors |
| POST | `/students/commit` | Admin, HoD | Commit validated rows → bulkWrite → send credential emails |
| POST | `/faculty/preview` | Admin, HoD | Same for faculty |
| POST | `/faculty/commit` | Admin, HoD | Same for faculty |
| POST | `/electives/preview` | Admin, HoD | Upload elective assignments `Roll No, Subject Code, Faculty Employee ID` |
| POST | `/electives/commit` | Admin, HoD | Commit elective assignments |
| POST | `/mentors/preview` | Admin, HoD | Upload mentor assignments `Roll No, Faculty Employee ID` |
| POST | `/mentors/commit` | Admin, HoD | Commit mentor assignments |
| GET | `/template/:type` | Admin, HoD | Download Excel template (students/faculty/electives/mentors) |

**Student Import — Required Excel Columns:**
```
Roll No | Name | Email
```
> classId is derived from the class context (URL param) — not from the file.

**Elective Import — Required Excel Columns:**
```
Roll No | Subject Code | Faculty Employee ID
```

**Mentor Import — Required Excel Columns:**
```
Roll No | Faculty Employee ID
```
> Supports range-based import: if consecutive roll numbers share a mentor, they can be listed individually or the UI handles range selection manually.

**Preview Response Shape:**
```json
{
  "valid": [ { "rollNo": "21CSE001", "name": "Riya", "email": "..." } ],
  "errors": [
    { "row": 14, "data": { "rollNo": "21CSE014" }, "reason": "Roll number already exists" },
    { "row": 22, "data": { "rollNo": "21CSE022" }, "reason": "Invalid email format" }
  ],
  "summary": { "total": 65, "valid": 63, "errors": 2 }
}
```

---

#### Batch — `/api/batch`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Admin, HoD | List batches (filter: class, dept, semester, year, status) |
| POST | `/initiate` | Admin, HoD | Initiate no-due batch for a class |
| GET | `/:batchId` | Admin, HoD | Batch metadata + student-wise status grid |
| GET | `/:batchId/students/:studentId` | Admin, HoD | Per-student approval breakdown |
| PATCH | `/:batchId/close` | Admin, HoD | Manually close a batch |
| POST | `/:batchId/students` | Admin, HoD | Add a student to an active batch manually |
| DELETE | `/:batchId/faculty/:facultyId` | Admin, HoD | Remove faculty from active batch |

**POST `/api/batch/initiate` — Request Body:**
```json
{
  "classId": "ObjectId",
  "semester": 5,
  "academicYear": "2025-26",
  "deadline": "2026-05-15T23:59:00Z"
}
```

**Validation before initiation:**
- No active batch for this `classId + semester + academicYear` already exists
- Class has at least 1 student (`studentIds.length > 0`)
- Class has at least 1 subject assignment (`subjectAssignments.length > 0`)
- Class has a `classTeacherId` assigned

---

#### Approvals — `/api/approvals`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/pending` | Faculty | All pending approval records for this faculty across active batches |
| GET | `/history` | Faculty | Past actioned approvals (paginated) |
| POST | `/approve` | Faculty | Approve a specific approval record |
| POST | `/mark-due` | Faculty | Mark due with type + remarks |
| PATCH | `/:approvalId` | Faculty | Update a previously submitted action (batch must be active) |

**POST `/api/approvals/approve`:**
```json
{ "approvalId": "ObjectId" }
```

**POST `/api/approvals/mark-due`:**
```json
{
  "approvalId": "ObjectId",
  "dueType": "library | lab | fees | attendance | other",
  "remarks": "Student has pending lab record submission"
}
```

**On every approval action — server sequence:**
1. Verify `approvalId` belongs to this faculty (`facultyId` match)
2. Verify batch is `status: active`
3. Update `nodueApproval`: action, dueType, remarks, actionedAt
4. Recompute `nodueRequest.status` via `statusService.js`
5. Invalidate cache: `batch_status:{batchId}`, `student_status:{studentId}`
6. SSE push: `approval_updated` event to admin + student SSE connections

---

#### HoD — `/api/hod`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/overview` | All active batches in HoD's department with summary counts |
| GET | `/pending` | HoD's normal per-student approval queue for active batches |
| GET | `/dues` | All `has_dues` requests in HoD's department |
| POST | `/override` | Force-clear a `has_dues` request |

> HoD approval itself uses the standard approval action flow, just like faculty approvals. `/api/hod/*` is for HoD dashboard data and override handling, not a replacement for the normal HoD approval record.

**POST `/api/hod/override`:**
```json
{
  "requestId": "ObjectId",
  "overrideRemark": "Dues cleared after manual verification"
}
```

---

#### Student Portal — `/api/student`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/status` | Current semester no-due status: overall + per-approval breakdown |
| GET | `/history` | Past semester no-due records |

**GET `/api/student/status` — Response:**
```json
{
  "rollNo": "21CSE001",
  "name": "Riya Sharma",
  "department": "CSE",
  "semester": 5,
  "academicYear": "2025-26",
  "overallStatus": "pending | cleared | has_dues | hod_override",
  "approvals": [
    {
      "subjectName": "DBMS",
      "subjectCode": "CS501",
      "facultyName": "Dr. Sharma",
      "approvalType": "subject",
      "action": "approved",
      "dueType": null,
      "remarks": null,
      "actionedAt": "2026-05-10T14:32:00Z"
    },
    {
      "subjectName": null,
      "subjectCode": null,
      "facultyName": "Dr. Patel",
      "approvalType": "classTeacher",
      "action": "pending",
      "dueType": null,
      "remarks": null,
      "actionedAt": null
    },
    {
      "subjectName": null,
      "subjectCode": null,
      "facultyName": "Dr. Meena",
      "approvalType": "mentor",
      "action": "due_marked",
      "dueType": "attendance",
      "remarks": "Attendance below 75% in 3 weeks",
      "actionedAt": "2026-05-09T10:15:00Z"
    }
  ]
}
```

---

#### SSE — `/api/sse`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/connect` | All authenticated | Establish persistent SSE connection |

**SSE Event Types:**
```
approval_updated   → { requestId, studentId, facultyId, action, overallStatus }
batch_initiated    → { batchId, classId, className, totalStudents }
batch_closed       → { batchId, classId }
override_applied   → { requestId, studentId, overriddenBy, overallStatus }
student_added      → { batchId, studentId, rollNo }
```

---

### 5.4 Batch Initiation Engine (`batchService.js`)

```
Input: { classId, semester, academicYear, deadline, initiatedBy }

Step 1 — Validate
  ├── Class exists and isActive
  ├── No active batch for classId + semester + academicYear
  ├── class.studentIds.length > 0
  ├── class.subjectAssignments.length > 0
  └── class.classTeacherId exists

Step 2 — Build batch document
  └── INSERT nodueBatch

Step 3 — For each student in class.studentIds:

  3a. Build facultySnapshot for THIS student:
      ├── class.subjectAssignments → { facultyId, facultyName, subjectId, subjectName, subjectCode, roleTag: "faculty", approvalType: "subject" }
      ├── student.electiveSubjects → same shape, isElective: true
      ├── class.classTeacherId    → { facultyId, facultyName, subjectId: null, subjectName: null, roleTag: "classTeacher", approvalType: "classTeacher" }
      ├── student.mentorId        → { facultyId, facultyName, subjectId: null, subjectName: null, roleTag: "mentor", approvalType: "mentor" }
      └── department.hodId       → { facultyId, facultyName, subjectId: null, subjectName: null, roleTag: "hod", approvalType: "hodApproval" }

  3b. INSERT nodueRequest with:
      ├── batchId, studentId
      ├── studentSnapshot: { rollNo, name, departmentName }
      ├── facultySnapshot (from 3a)
      └── status: "pending"

  3c. INSERT nodueApprovals — one per facultySnapshot entry:
      └── { requestId, batchId, studentId, studentRollNo, studentName,
            facultyId, subjectId, subjectName, approvalType, roleTag,
            action: "pending" }

Step 4 — Execute all inserts as bulkWrite() — single round trip

Step 5 — Prime cache: batch_status:{batchId}

Step 6 — SSE broadcast: batch_initiated to admin connections
```

---

### 5.5 Caching Strategy

| Cache Key | TTL | Invalidated When |
|---|---|---|
| `batch_status:{batchId}` | 60s | Any approval action in that batch |
| `student_status:{studentId}` | 30s | Any approval for that student |
| `faculty_pending:{facultyId}` | 30s | Faculty submits any action |
| `class_detail:{classId}` | 300s | Class is edited |

> At peak load, students refreshing their status page hit `student_status:{studentId}` cache — not MongoDB. Cache entries are student-scoped and invalidated precisely.

---

### 5.6 Error Response Shape

```json
{
  "success": false,
  "error": {
    "code": "BATCH_ALREADY_EXISTS",
    "message": "An active batch already exists for CSE-A Sem 5 (2025-26)",
    "statusCode": 409
  }
}
```

**Error Codes:**
```
AUTH_INVALID_CREDENTIALS         401
AUTH_ROLL_NOT_FOUND              401
AUTH_PASSWORD_CHANGE_REQUIRED    403
AUTH_UNAUTHORIZED                403
AUTH_FORBIDDEN_DEPARTMENT        403
BATCH_ALREADY_EXISTS             409
BATCH_NOT_ACTIVE                 400
BATCH_NO_STUDENTS                400
BATCH_NO_SUBJECTS                400
BATCH_NO_CLASS_TEACHER           400
APPROVAL_NOT_FOUND               404
APPROVAL_WRONG_FACULTY           403
APPROVAL_ALREADY_ACTIONED        409
IMPORT_VALIDATION_FAILED         422
NOT_FOUND                        404
INTERNAL_SERVER_ERROR            500
```

---

### 5.7 Mongoose Connection

```javascript
mongoose.connect(MONGO_URI, {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
```

---

## 6. Frontend PRD

### 6.1 Project Structure

```
/client
  /public
  /src
    /api
      auth.js
      departments.js
      subjects.js
      classes.js
      faculty.js
      students.js
      batch.js
      approvals.js
      hod.js
      studentPortal.js
      import.js
      sse.js
    /components
      /ui
        Button.jsx
        Badge.jsx          — Status badge with color mapping
        Table.jsx          — Sortable, filterable table base
        Modal.jsx
        Toast.jsx
        Spinner.jsx
        FileDropzone.jsx
        Pagination.jsx
      /layout
        Sidebar.jsx        — Role-aware navigation
        Navbar.jsx
        PageWrapper.jsx
      /batch
        BatchStatusGrid.jsx     — Live student × faculty approval grid
        StudentApprovalCard.jsx — Per-student approval breakdown
        BatchSummaryChips.jsx   — Cleared/Pending/Dues/Override counts
      /import
        ImportStepper.jsx       — Upload → Preview → Confirm 3-step flow
        PreviewTable.jsx        — Valid/error rows with inline error display
        ErrorRow.jsx
      /approvals
        ApprovalCard.jsx        — Student card with approve/mark-due actions
        DueForm.jsx             — Inline due type + remarks form
        OverrideModal.jsx       — HoD override confirmation modal
    /pages
      /auth
        Login.jsx
        ChangePassword.jsx
      /admin
        Dashboard.jsx
        Departments.jsx
        DepartmentClasses.jsx
        ClassDetail.jsx         — Students tab + Subjects tab + Batch tab
        FacultyList.jsx
        StudentList.jsx
        BatchView.jsx
        BatchStudentDetail.jsx
      /hod
        Dashboard.jsx
        Pending.jsx
        Dues.jsx
        Overrides.jsx
      /faculty
        Dashboard.jsx
        Pending.jsx
        History.jsx
      /student
        Status.jsx
    /hooks
      useAuth.js
      useSSE.js
      useBatchStatus.js
      useImport.js
    /context
      AuthContext.jsx
    /utils
      roleRedirect.js       — Post-login redirect by role
      statusColors.js       — Status → Tailwind color class mapping
      formatters.js         — Date, roll number formatters
      constants.js
    App.jsx
    main.jsx
```

---

### 6.2 Auth Pages

#### `/login`
- Single login page for all non-student roles
- Fields: Email, Password
- Separate tab or link: "Student Login" → roll number only field
- On success: server role in JWT → `roleRedirect.js` routes to correct portal
- If `mustChangePassword: true` → forced redirect to `/change-password`

#### Student Login (same page, separate tab)
- Single field: Roll Number
- No password field
- On success → `/student/status`

#### `/change-password`
- Fields: New Password, Confirm Password
- Validation: min 8 chars, must differ from temporary credential
- On success → role-appropriate dashboard

---

### 6.3 Navigation Structure

```
Admin / HoD Sidebar:
  Dashboard
  Departments
    └── [Dept Name]
          └── Classes
                └── [Class Name]   ← hub for everything
  Faculty
  Subjects
  Batches

Faculty Sidebar:
  Dashboard
  Pending Actions
  History

Student: No sidebar — single status page
```

---

### 6.4 Admin / HoD Pages

#### `/admin/dashboard` or `/hod/dashboard`
- Stats row: Active Batches | Total Students | Cleared | Pending | Has Dues
- Active batches table: Class | Initiated | Cleared | Pending | Dues | Action
- Alert banner: count of `has_dues` requests needing attention (HoD only)
- Recent activity feed: last 10 actions across all batches

---

#### `/admin/departments`
- Lists all departments (Admin sees both CSE + ECE; HoD lands directly on their dept)
- Each dept card: name, HoD name, class count, active batch count
- Click → `/admin/departments/:deptId/classes`

#### `/admin/departments/:deptId/classes`
- Lists all classes in department grouped by semester
- Each class card: name, semester, year, student count, subject count, active batch indicator
- "Create Class" button → modal with:
  - Class name, Semester, Academic Year
  - **"Copy subject structure from existing class?"** — optional dropdown to select a source class
  - If selected: subjects are pre-filled from source class, faculty fields left blank for reassignment
  - This handles the multi-section scenario (e.g. CSD-A through CSD-E) — admin creates CSD-B, clones subjects from CSD-A, then just assigns faculty per subject
- Click class → `/admin/classes/:classId`

---

#### `/admin/classes/:classId` — Class Hub

Three tabs:

**Tab 1: Students**
- Table: Roll No | Name | Email | Mentor | Electives | Status (if active batch)
- Display order: Roll No first, then Name, then Department, then rest
- "Import Students" button → opens Import flow (XLSX/CSV, Roll No | Name | Email only)
- "Add Single Student" button → inline form
- Per student: assign mentor (dropdown), manage electives (add/remove)
- "Bulk Assign Mentors" → import flow (Roll No | Faculty Employee ID)
- "Bulk Assign Electives" → import flow (Roll No | Subject Code | Faculty Employee ID)

**Tab 2: Subjects**
- Table: Subject Code (overridden if set, else default) | Subject Name | Faculty | Type (Core / Elective) | Actions
- "Add Subject Assignment" → search global subjects list by name or code → select → assign faculty → optionally override subject code for this class
- Edit: reassign faculty, update subject code override
- Remove subject assignment from class
- **"Clone from another class"** button — select any existing class → copies all subject entries (same subjectIds) with faculty fields cleared for reassignment. Useful for setting up multiple sections quickly.

**Tab 3: Batch**
- Current active batch status (if exists): summary chips + "View Full Grid" link
- "Initiate No-Due Batch" button (disabled if active batch exists)
  - Initiation modal: confirm semester, year, optional deadline
  - Pre-flight checklist shown in modal: ✅ Students enrolled | ✅ Subjects assigned | ✅ Class teacher set | ✅ All student mentors assigned
- Past batches list

---

#### `/admin/batch/:batchId` — Batch Status Grid

- Batch metadata header: Class | Semester | Year | Initiated | Deadline | Status
- Summary chips: 🟢 Cleared | 🟡 Pending | 🔴 Has Dues | 🔷 Override
- **Status Grid:**
  - Rows: Students (Roll No | Name — roll no first always)
  - Columns: Each unique faculty (grouped by name, not repeated per subject)
  - Cell content: subject abbreviation + action icon
    - ✅ = approved, ⏳ = pending, ❌ = due marked
  - Hover/click cell → popover: subject name, due type, remarks, timestamp
  - Click student row → `/admin/batch/:batchId/students/:studentId`
- SSE-powered: cells update in real time
- Filter: All | Has Dues only | Pending only
- "Close Batch" button → confirmation modal

#### `/admin/batch/:batchId/students/:studentId`
- Student header: Roll No | Name | Department (in that order)
- Per-approval cards listed vertically:
  - Subject Name (or "Class Teacher" / "Mentor" / "HoD Approval" for role-based)
  - Faculty Name
  - Action status badge
  - If due_marked: Due Type chip + Remarks text
  - If hod_override: "Cleared by HoD" badge + override remark
- Overall status banner at top

---

#### Faculty Management — `/admin/faculty`
- Table: Employee ID | Name | Email | Department | Role Tags | Actions
- "Add Faculty" → modal: name, employeeId, email, phone, department, roleTags (multi-select)
- On create: credential auto-generated → Resend email fired
- Edit: update any field, add/remove roleTags
- View: classes assigned (derived from class subjectAssignments)

---

### 6.5 Faculty Portal

#### `/faculty/dashboard`
- "You have N pending approvals across X classes"
- Active batches summary cards (one per class this faculty is in)
- CTA: "Go to Pending Actions"

#### `/faculty/pending`
- Batch selector dropdown (if assigned to multiple classes with active batches)
- Student list (20 per page)
- Filter tabs: All | Pending | Approved | Due Marked
- **Each student card:**
  - Roll No | Name | Department (roll no always first)
  - Subject being approved (this faculty's subject for this student)
  - Approval type badge: "Subject — DBMS" or "Class Teacher" or "Mentor"
  - Current action status
  - If pending:
    - "✅ Approve" button → single click, instant toast confirmation
    - "❌ Mark Due" button → inline form expands:
      - Due Type: Library / Lab / Fees / Attendance / Other (dropdown)
      - Remarks (required text area)
      - Submit
  - If actioned: shows result + "Edit" button (only if batch active)
- If faculty teaches 2 subjects in same class → student appears twice (once per subject)
- SSE: card updates if another session acts on same record

#### `/faculty/history`
- Past approvals: Roll No | Student Name | Subject | Batch | Action | Date
- Filterable by semester, academic year

---

### 6.6 HoD Portal

#### `/hod/dashboard`
- Department overview (scoped to own dept automatically)
- Batch summary cards per class
- "You have N pending HoD approvals across X classes"
- Alert: "X students have blocked clearances requiring override"

#### `/hod/pending`
- Same per-student approval pattern as faculty, but scoped only to the HoD approval record for each student
- Batch selector dropdown for active batches in HoD's department
- Student list (20 per page)
- Filter tabs: All | Pending | Approved | Due Marked
- **Each student card:**
  - Roll No | Name | Class | Department
  - Approval type badge: "HoD Approval"
  - Current action status
  - If pending:
    - "✅ Approve" button → single click, instant toast confirmation
    - "❌ Mark Due" button → inline form expands:
      - Due Type: Library / Lab / Fees / Attendance / Other (dropdown)
      - Remarks (required text area)
      - Submit
  - If actioned: shows result + "Edit" button (only if batch active)
- This queue is the normal HoD approval stage and is separate from override
- SSE: card updates if another session acts on same record

#### `/hod/dues`
- Table: Roll No | Name | Class | Faculty Who Flagged | Subject | Due Type | Remarks
- "Override & Clear" button → modal:
  - Shows: faculty name, subject, due type, their remarks
  - Input: Override Remark (required)
  - Confirm → fires POST `/api/hod/override`
- After override: row moves to "Overridden" tab
- SSE: table updates as new dues are flagged

---

### 6.7 Student Portal

#### `/student/status`
- Header: Roll No | Name | Department (roll no always first)
- Semester + Academic Year label
- **Overall Status Banner:**
  - 🟢 "You are Cleared" — all approved or hod_override
  - 🟡 "Approvals Pending" — some faculty haven't acted
  - 🔴 "Dues Flagged" — one or more due_marked
- **Approval list (cards, read-only):**

  ```
  DBMS (CS501)           Dr. Sharma        ✅ Approved
  OS (CS502)             Dr. Sharma        ⏳ Pending
  Networks (CS503)       Dr. Patel         ❌ Due Marked
                                              Type: Lab
                                              "Lab record not submitted"
  Machine Learning       Dr. Rao           ✅ Approved
  (Open Elective)
  Class Teacher          Dr. Patel         ✅ Approved
  Mentor                 Dr. Meena         ⏳ Pending
  HoD Approval           Dr. Reddy         ⏳ Pending
  ```

- Display order per card: Subject/Role | Faculty Name | Status
- If `hod_override`: shows "Cleared by HoD ✔" badge with override remark
- SSE-powered: status updates without manual refresh
- "Past Semesters" tab: read-only history of previous clearances

---

### 6.8 Import Flow (Shared Component — `ImportStepper.jsx`)

Used for: students, faculty, electives, mentors.

**Step 1 — Upload**
- File dropzone: accepts `.xlsx`, `.csv`
- "Download Template" button → correct column headers pre-filled
- Context label: "Importing students for CSE-A Sem 5"

**Step 2 — Preview**
- Table of all parsed rows
- Green left border = valid
- Red left border = error + inline error chip
- Summary: "63 valid · 2 errors"
- "Download Error Report" button if errors exist
- "Fix errors before committing" message if any errors

**Step 3 — Confirm**
- "Commit 63 Records" button
- Progress bar as bulkWrite + emails fire
- Result summary: "63 created successfully. Credential emails sent."

---

### 6.9 Shared UI Conventions

**Status Badge Colors:**
```
pending      → Amber    "⏳ Pending"
approved     → Green    "✅ Approved"
due_marked   → Red      "❌ Due Marked"
cleared      → Green    "🟢 Cleared"
has_dues     → Red      "🔴 Has Dues"
hod_override → Blue     "🔷 HoD Cleared"
```

**Table Column Order (everywhere in system):**
```
Roll No → Name → Department → (context-specific columns) → Actions
```

**Toast Notifications:**
- Success: "Approved Riya Sharma for DBMS ✅"
- Error: API error message
- Auto-dismiss: 3 seconds

---

### 6.10 Routing & Guards

```
/login                              Public
/student-login                      Public

/admin/*                            Role: admin
/hod/*                              Role: hod (dept-scoped)
/faculty/*                          Role: faculty (any roleTag)
/student/*                          Role: student

mustChangePassword guard:
  Any authenticated route except /change-password
  → redirect to /change-password if flag is true
```

---

### 6.11 Responsive Design

- Admin batch grid: horizontal scroll on mobile (column-heavy by design)
- Faculty pending list: responsive card layout on mobile
- Student status page: fully mobile-optimised (students check on phones)
- Admin/HoD management pages: desktop-primary, tablet-acceptable

---

## 7. No-Due Generation Flow

```
TRIGGER: Admin/HoD clicks "Initiate No-Due" for Class CSE-A, Sem 5
│
▼
VALIDATION (hard blocks)
  ├── Active batch already exists? → 409
  ├── Class has students?          → 400 if empty
  ├── Class has subjects?          → 400 if empty
  └── Class teacher assigned?      → 400 if missing
│
▼
BUILD BATCH DOCUMENT → INSERT nodueBatch
│
▼
FOR EACH student in class.studentIds:
│
├── BUILD facultySnapshot (student-specific):
│     ├── class.subjectAssignments  (core subjects)
│     ├── student.electiveSubjects  (open electives, if any)
│     ├── class.classTeacherId      (roleTag: classTeacher)
│     └── student.mentorId          (roleTag: mentor)
│
├── INSERT nodueRequest:
│     { batchId, studentId, studentSnapshot, facultySnapshot, status: "pending" }
│
└── INSERT nodueApprovals (one per facultySnapshot entry):
      { requestId, facultyId, subjectId, approvalType, action: "pending" }
│
▼
EXECUTE bulkWrite() — single atomic round trip to MongoDB
│
▼
PRIME cache: batch_status:{batchId}
│
▼
SSE BROADCAST: batch_initiated → all admin connections

════════════════════════════════════════════

FACULTY ACTION: Approve or Mark Due
│
├── Verify approval belongs to this faculty
├── Verify batch is active
├── Update nodueApproval { action, dueType, remarks, actionedAt }
├── Recompute nodueRequest.status
├── Invalidate cache: batch_status + student_status
└── SSE push: approval_updated → admin + student

════════════════════════════════════════════

HOD OVERRIDE
│
├── Verify request.status === "has_dues"
├── Update nodueRequest { status: "hod_override", overriddenBy, overrideRemark }
├── Invalidate cache
└── SSE push: override_applied → admin + student
```

---

**Clarification locked for v4.0:** every `nodueRequest` must include one normal HoD approval entry in `facultySnapshot` and `nodueApprovals`, one per student. A student is not fully cleared until that HoD approval is approved. HoD override is a separate exception path and must never replace the normal HoD approval stage.

## 8. Data Import Strategy

### Supported Formats
`.xlsx` (primary) and `.csv` (fallback)

### Import Types & Columns

| Import Type | Required Columns | Context |
|---|---|---|
| Students | Roll No, Name, Email | From class page — classId from URL |
| Faculty | Employee ID, Name, Email, Phone, Role Tags | Department from session scope |
| Electives | Roll No, Subject Code, Faculty Employee ID | Bulk assign electives per student |
| Mentors | Roll No, Faculty Employee ID | Bulk assign mentors per student |

### Deduplication (CSV parse-time)
```javascript
const seenRollNos = new Set()  // O(1) lookup
for (const row of rows) {
  if (seenRollNos.has(row.rollNo)) {
    errors.push({ row: i, reason: "Duplicate roll number in file" })
    continue
  }
  seenRollNos.add(row.rollNo)
  // then check DB for existing
}
```

### Commit Strategy
```javascript
await Student.bulkWrite(validRows.map(row => ({
  insertOne: { document: { ...row, classId, createdAt: new Date() } }
})), { ordered: false })  // skip errors, insert valid
```

---

## 9. Real-Time Strategy

### SSE Connection Manager

```javascript
// sseService.js — O(1) lookup hash map
const connections = new Map()
// Keys: "admin:{id}", "faculty:{id}", "student:{id}", "hod:{id}"

function addConnection(key, res) {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  connections.set(key, res)
  res.on("close", () => connections.delete(key))
}

function push(key, event, data) {
  const res = connections.get(key)
  if (res) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}
```

### Client Reconnection
```javascript
// useSSE.js
const es = new EventSource("/api/sse/connect", { withCredentials: true })
// EventSource auto-reconnects on drop — native browser behaviour
es.addEventListener("approval_updated", (e) => { ... })
es.addEventListener("override_applied", (e) => { ... })
```

---

## 10. Email & Credential System

### Credential Format
```
Faculty:  {employeeId}@Mits#{4-digit-random}   → EMP042@Mits#3916
Admin:    {name-slug}@Mits#{4-digit-random}     → john.doe@Mits#7241
Students: No password — roll number login only
```

### Email Template (Faculty)
```
Subject: No-Due Clearance System — Your Login Credentials

Dear {name},

Your faculty account for the MITS No-Due Clearance System has been created.

Portal: https://nds-mits.vercel.app
Login Email: {email}
Temporary Password: {password}

You will be prompted to change your password on first login.

Regards,
MITS Office Administration
```

### Trigger Points
- Faculty account created → credential email
- Admin account created → credential email
- Student account created → credential email (with roll number, no password)

---

## 11. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React 18 + Vite | Fast build, SPA, no SSR needed |
| Styling | Tailwind CSS | Rapid UI, consistent design system |
| HTTP Client | Axios | Interceptors for JWT + error handling |
| Real-time | SSE (native EventSource) | One-way push, lighter than WebSockets, Render-compatible |
| Backend | Express.js | Persistent server required for SSE + connection pooling |
| Auth | JWT (jsonwebtoken) + bcrypt | Stateless, role + dept payload in token |
| Database | MongoDB Atlas M0 | Flexible schema, free tier, sufficient for ~650 users |
| ODM | Mongoose | Schema enforcement, pre/post hooks |
| Cache | node-cache | In-process, zero latency, no Redis overhead |
| File Parse | xlsx (npm) | Handles .xlsx and .csv |
| Email | Resend | Simple API, 3k free emails/month |
| Frontend Host | Vercel | Free, zero-config for React/Vite |
| Backend Host | Render (Free Tier) | Persistent server — not serverless |
| Keepalive | UptimeRobot | 5-min ping prevents Render sleep |

---

## 12. Non-Goals v1

- PDF export / clearance certificate generation
- SMS notifications
- Mobile native app
- College ERP integration
- Departments beyond CSE and ECE
- Student dispute / appeal mechanism
- Timetable management UI
- Analytics / reporting dashboard
- Audit log viewer
- Bulk batch initiation across multiple classes at once

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Render free tier sleeps | Cold start at peak | UptimeRobot 5-min ping eliminates sleep window |
| MongoDB M0 connection limit (100) | Spike overwhelms DB | Mongoose pool capped at 10; node-cache absorbs read load |
| Faculty don't log in before deadline | Batch stays pending | Admin dashboard shows who hasn't acted; admin follows up directly |
| Wrong subject-faculty assignment before batch | Incorrect approvers in batch | Admin/HoD can edit class subjects before initiation; snapshot freezes at initiation |
| Electives not assigned before batch initiation | Student missing elective approvals | Validation warning (not hard block) if student has no electives but is in 3rd year+ |
| Multi-section faculty managing 130+ students | Faculty overwhelmed in pending list | Batch selector groups by class; faculty actions one class at a time |
| Subject code conflicts across departments | Wrong code shown on student card | `subjectCode` override at assignment level; falls back to subject default if not overridden |
| CSV import typos | Failed rows | Preview step with per-row error display; template download prevents column errors |
| Email deliverability failure | Credentials not received | Admin can view generated credential on faculty detail page as manual fallback |
| Duplicate batch initiation | Data inconsistency | Hard block: 409 if active batch exists for classId + semester + year |
| SSE connection drop at peak | Missed real-time updates | EventSource auto-reconnects natively; DB state is always correct on manual refresh |
| Student added after batch | Missing from clearance | Admin manually adds student to active batch via `/api/batch/:id/students` |
| HoD reassignment mid-semester | Wrong HoD in active batches | Snapshot is frozen — reassignment only affects future batches |

---

*End of PRD v4.0 — No-Due Clearance System, MITS*  
*All architectural decisions locked. Ready for development scaffolding.*
