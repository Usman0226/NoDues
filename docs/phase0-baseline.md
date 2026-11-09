# Phase 0 Baseline Performance & Schema Audit
**Database:** `test_nodues_staging_baseline`  
**Captured At:** `2026-11-09T21:17:42.035Z`  
**Target Host:** `mongodb://127.0.0.1:64019/test_nodues_staging_baseline`  
**TRD Reference:** TRD §5 Phase 0 (Step 0.4) | Non-Negotiable Constraints: NC-1, NC-2, NC-6

---

## 1. Executive Summary

This document captures the baseline state of the live/staging database prior to introducing any Phase 1 additive schemas (batches, semesterSubjects, feature flags). It establishes the performance and index reference against which all subsequent migration phases must be validated to ensure zero regression.

---

## 2. Collection Inventory & Storage Metrics

| Collection | Documents | Data Size | Storage Size | Index Size | Avg Doc Size |
|---|---|---|---|---|---|
| `admins` | 0 | 0.0 KB | 4.0 KB | 8.0 KB | 0 B |
| `classes` | 1 | 0.2 KB | 4.0 KB | 16.0 KB | 233 B |
| `cocurriculartypes` | 0 | 0.0 KB | 4.0 KB | 8.0 KB | 0 B |
| `departments` | 1 | 0.1 KB | 4.0 KB | 12.0 KB | 119 B |
| `emaillogs` | 0 | 0.0 KB | 4.0 KB | 16.0 KB | 0 B |
| `emailquotas` | 0 | 0.0 KB | 4.0 KB | 8.0 KB | 0 B |
| `faculties` | 1 | 0.3 KB | 4.0 KB | 20.0 KB | 340 B |
| `feedbacks` | 0 | 0.0 KB | 4.0 KB | 12.0 KB | 0 B |
| `nodueapprovals` | 1 | 0.2 KB | 4.0 KB | 28.0 KB | 220 B |
| `noduebatches` | 1 | 0.2 KB | 4.0 KB | 16.0 KB | 179 B |
| `noduerequests` | 1 | 0.1 KB | 4.0 KB | 16.0 KB | 133 B |
| `notifications` | 0 | 0.0 KB | 4.0 KB | 12.0 KB | 0 B |
| `students` | 1 | 0.3 KB | 4.0 KB | 24.0 KB | 318 B |
| `subjects` | 0 | 0.0 KB | 4.0 KB | 16.0 KB | 0 B |
| `tasks` | 0 | 0.0 KB | 4.0 KB | 12.0 KB | 0 B |

---

## 3. Index Inventory

All existing collection indexes are cataloged below. Phase 1 through Phase 5 migrations must not drop or invalidate any existing operational indexes.


### `admins`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `email_1` | `{"email":1}` | ✅ Yes | No |


### `classes`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `departmentId_1_isActive_1` | `{"departmentId":1,"isActive":1}` | No | No |
| `departmentId_1_semester_1_academicYear_1` | `{"departmentId":1,"semester":1,"academicYear":1}` | No | No |
| `classTeacherId_1` | `{"classTeacherId":1}` | No | No |


### `cocurriculartypes`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `code_1` | `{"code":1}` | ✅ Yes | No |


### `departments`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `name_1` | `{"name":1}` | ✅ Yes | No |
| `hodId_1` | `{"hodId":1}` | No | No |


### `emaillogs`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `recipient_1` | `{"recipient":1}` | No | No |
| `status_1` | `{"status":1}` | No | No |
| `timestamp_1` | `{"timestamp":1}` | No | No |


### `emailquotas`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `date_1` | `{"date":1}` | ✅ Yes | No |


### `faculties`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `email_1` | `{"email":1}` | ✅ Yes | No |
| `employeeId_1` | `{"employeeId":1}` | ✅ Yes | No |
| `departmentId_1_isActive_1` | `{"departmentId":1,"isActive":1}` | No | No |
| `departmentId_1_roleTags_1` | `{"departmentId":1,"roleTags":1}` | No | No |


### `feedbacks`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `createdAt_-1` | `{"createdAt":-1}` | No | No |
| `submittedBy.user_1` | `{"submittedBy.user":1}` | No | No |


### `nodueapprovals`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `requestId_1_facultyId_1_subjectId_1_roleTag_1_itemTypeId_1` | `{"requestId":1,"facultyId":1,"subjectId":1,"roleTag":1,"itemTypeId":1}` | ✅ Yes | No |
| `batchId_1_facultyId_1_action_1` | `{"batchId":1,"facultyId":1,"action":1}` | No | No |
| `batchId_1_action_1` | `{"batchId":1,"action":1}` | No | No |
| `studentId_1_batchId_1` | `{"studentId":1,"batchId":1}` | No | No |
| `facultyId_1_action_1` | `{"facultyId":1,"action":1}` | No | No |
| `requestId_1_action_1` | `{"requestId":1,"action":1}` | No | No |


### `noduebatches`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `classId_1_status_1` | `{"classId":1,"status":1}` | ✅ Yes | No |
| `departmentId_1_status_1` | `{"departmentId":1,"status":1}` | No | No |
| `status_1` | `{"status":1}` | No | No |


### `noduerequests`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `batchId_1_status_1` | `{"batchId":1,"status":1}` | No | No |
| `studentId_1` | `{"studentId":1}` | No | No |
| `batchId_1_studentId_1` | `{"batchId":1,"studentId":1}` | No | No |


### `notifications`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `createdAt_1` | `{"createdAt":1}` | No | No |
| `user_1_read_1_createdAt_-1` | `{"user":1,"read":1,"createdAt":-1}` | No | No |


### `students`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `rollNo_1` | `{"rollNo":1}` | ✅ Yes | No |
| `rollNo_1_isActive_1` | `{"rollNo":1,"isActive":1}` | No | No |
| `classId_1_isActive_1` | `{"classId":1,"isActive":1}` | No | No |
| `departmentId_1_isActive_1` | `{"departmentId":1,"isActive":1}` | No | No |
| `mentorId_1` | `{"mentorId":1}` | No | No |


### `subjects`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `code_1` | `{"code":1}` | ✅ Yes | No |
| `semester_1_isElective_1_isActive_1` | `{"semester":1,"isElective":1,"isActive":1}` | No | No |
| `name_text` | `{"_fts":"text","_ftsx":1}` | No | No |


### `tasks`
| Index Name | Key Pattern | Unique | Sparse |
|---|---|---|---|
| `_id_` | `{"_id":1}` | No | No |
| `expiresAt_1` | `{"expiresAt":1}` | No | No |
| `actor_1_createdAt_-1` | `{"actor":1,"createdAt":-1}` | No | No |


---

## 4. Query Latency Benchmarks (Pre-Migration Baseline)

Benchmarked over 20 iterations using warm connection pool:

| Query Workflow | Target Collection & Key | p50 (ms) | p95 (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|---|
| **Student Status (Request)** | `noduerequests` by `{ studentId, batchId }` | 0.87 | 1.47 | 0.52 | 1.47 |
| **Student Status (Approvals)** | `nodueapprovals` by `{ studentId, batchId }` | 0.75 | 1.15 | 0.43 | 1.15 |
| **Batch Grid (Approvals)** | `nodueapprovals` by `{ batchId }` (limit 100) | 0.88 | 1.24 | 0.63 | 1.24 |
| **Faculty Approve Lookup** | `nodueapprovals` by `{ _id, facultyId }` | 1.23 | 2.2 | 0.81 | 2.2 |
| **Batch Initiate (Class)** | `classes` by `{ _id }` | 0.75 | 4.92 | 0.37 | 4.92 |

---

## 5. Query Execution Plans (`explain('executionStats')`)

### 5.1 Student Status: Request Lookup (`noduerequests`)
```javascript
db.noduerequests.find({ studentId: ObjectId("6af2387502c2e9f666369d7f"), batchId: ObjectId("6af2387502c2e9f666369d80") })
```
- **Winning Stage:** `FETCH` (input: `IXSCAN`)
- **Index Used:** `batchId_1_studentId_1`
- **Total Docs Examined:** 1
- **Total Keys Examined:** 1
- **Execution Time:** 0 ms

### 5.2 Student Status: Approvals List (`nodueapprovals`)
```javascript
db.nodueapprovals.find({ studentId: ObjectId("6af2387502c2e9f666369d7f"), batchId: ObjectId("6af2387502c2e9f666369d80") })
```
- **Winning Stage:** `FETCH` (input: `IXSCAN`)
- **Index Used:** `studentId_1_batchId_1`
- **Total Docs Examined:** 1
- **Total Keys Examined:** 1
- **Execution Time:** 0 ms

### 5.3 Batch Grid: Approvals List (`nodueapprovals`)
```javascript
db.nodueapprovals.find({ batchId: ObjectId("6af2387502c2e9f666369d80") })
```
- **Winning Stage:** `FETCH` (input: `IXSCAN`)
- **Index Used:** `batchId_1_action_1`
- **Total Docs Examined:** 1
- **Total Keys Examined:** 1
- **Execution Time:** 0 ms

### 5.4 Faculty Approve: Approval Record Lookup (`nodueapprovals`)
```javascript
db.nodueapprovals.find({ _id: ObjectId("6af2387502c2e9f666369d82"), facultyId: ObjectId("6af2387502c2e9f666369d7d") })
```
- **Winning Stage:** `FETCH` (input: `IXSCAN`)
- **Index Used:** `_id_`
- **Total Docs Examined:** 1
- **Total Keys Examined:** 1
- **Execution Time:** 0 ms

### 5.5 Batch Initiate: Class Lookup (`classes`)
```javascript
db.classes.find({ _id: ObjectId("6af2387502c2e9f666369d7e") })
```
- **Winning Stage:** `EXPRESS_IXSCAN`
- **Index Used:** `_id_`
- **Total Docs Examined:** 1
- **Total Keys Examined:** 1
- **Execution Time:** 0 ms

---

## 6. Performance Regression Gate (Exit Criteria)

During Phase 1 (additive schema) and Phase 2 (batch inference migration):
1. **p95 latency** for `GET /api/student/status` must remain **< 300ms**.
2. **Execution stage** for `noduerequests` and `nodueapprovals` lookups must remain index-backed (`IXSCAN`), never degrading to full collection scan (`COLLSCAN`).
3. Total index count on existing collections must not decrease without an explicit migration changelog entry.
