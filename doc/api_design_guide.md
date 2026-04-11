# No-Due Clearance System — API Design Guide
## Single Source of Truth for Frontend & Backend

**Project:** No-Due Clearance System (NDS)  
**Version:** 1.0  
**Base URL (Dev):** `http://localhost:5000/api`  
**Base URL (Prod):** `https://nds-backend.onrender.com/api`  
**Date:** April 2026

> This document is the **single contract** between frontend and backend. Both teams must use the exact endpoint paths, request shapes, and response shapes defined here. Any deviation must be discussed and updated here first.

---

## Table of Contents

1. [Global Conventions](#1-global-conventions)
2. [Authentication](#2-authentication)
3. [Endpoint Master List](#3-endpoint-master-list)
4. [Auth Endpoints](#4-auth-endpoints)
5. [Department Endpoints](#5-department-endpoints)
6. [Subject Endpoints](#6-subject-endpoints)
7. [Class Endpoints](#7-class-endpoints)
8. [Faculty Endpoints](#8-faculty-endpoints)
9. [Student Endpoints](#9-student-endpoints)
10. [Import Endpoints](#10-import-endpoints)
11. [Batch Endpoints](#11-batch-endpoints)
12. [Approval Endpoints](#12-approval-endpoints)
13. [HoD Endpoints](#13-hod-endpoints)
14. [Student Portal Endpoints](#14-student-portal-endpoints)
15. [SSE Endpoint](#15-sse-endpoint)
16. [Error Reference](#16-error-reference)
17. [SSE Event Reference](#17-sse-event-reference)
18. [Frontend Usage Notes](#18-frontend-usage-notes)
19. [Backend Implementation Notes](#19-backend-implementation-notes)

---

## 1. Global Conventions

### Request Headers
```
Content-Type: application/json
Cookie: nds_token=<JWT>   ← set automatically by browser after login
```

### Success Response Envelope
Every successful response wraps data in a consistent shape:
```json
{
  "success": true,
  "data": { }
}
```
For lists:
```json
{
  "success": true,
  "data": [ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 65,
    "pages": 4
  }
}
```

### Error Response Envelope
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

### Pagination Query Params (all list endpoints)
```
?page=1&limit=20
```
Default: `page=1`, `limit=20`

### Common Filter Params
```
?departmentId=xxx
?semester=5
?academicYear=2025-26
?status=active
?isElective=true
?roleTag=classTeacher
?classId=xxx
?search=riya        ← name/rollNo search where supported
```

### ID Format
All IDs are MongoDB ObjectId strings. Example: `"6627a3f2e4b0c9d8f1234567"`

### Date Format
All dates are ISO 8601 UTC strings: `"2026-05-10T14:32:00.000Z"`

### Soft Delete
`DELETE` endpoints set `isActive: false` — records are never hard-deleted from the DB.

---

## 2. Authentication

### JWT Cookie
- Name: `nds_token`
- Type: `httpOnly`, `SameSite: Strict`
- Expiry: 8 hours
- Set by server on login, cleared on logout
- Frontend never reads or manages this cookie directly — browser handles it automatically

### JWT Payload
```json
{
  "userId": "6627a3f2e4b0c9d8f1234567",
  "role": "admin | faculty | hod | student",
  "roleTags": ["faculty", "classTeacher"],
  "departmentId": "6627a3f2e4b0c9d8f0000001",
  "rollNo": "21CSE001",
  "iat": 1714300000,
  "exp": 1714328800
}
```
> `roleTags` is only present for faculty. `rollNo` is only present for students. `departmentId` is present for faculty and HoD — null for admin.

### mustChangePassword Guard
If the server returns error code `AUTH_PASSWORD_CHANGE_REQUIRED` (403) on any request, frontend must immediately redirect to `/change-password` regardless of current route.

### Role Access Summary
| Role | Can Access |
|---|---|
| `admin` | All `/api/*` except `/api/student/*` and `/api/approvals/*` |
| `hod` | Same as admin but all queries auto-scoped to their `departmentId` |
| `faculty` | `/api/auth/*`, `/api/approvals/*`, `/api/sse/*` |
| `student` | `/api/auth/student-login`, `/api/auth/logout`, `/api/student/*`, `/api/sse/*` |

---

## 3. Endpoint Master List

> Complete reference table for all endpoints. Use this as the primary navigation guide during development. Method + Endpoint together form the unique identifier for each API call.

### 3.1 Auth

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Admin / Faculty login with email + password. Returns JWT in httpOnly cookie |
| `POST` | `/api/auth/student-login` | Public | Student login with roll number only. Returns JWT in httpOnly cookie |
| `POST` | `/api/auth/change-password` | Authenticated | Change password on first login (forced) or anytime |
| `POST` | `/api/auth/logout` | Authenticated | Clear JWT cookie and end session |
| `GET` | `/api/auth/me` | Authenticated | Get current logged-in user's profile and role info |

---

### 3.2 Departments

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `GET` | `/api/departments` | Admin | List all departments with HoD info and class/batch counts |
| `POST` | `/api/departments` | Admin | Create a new department and assign HoD |
| `GET` | `/api/departments/:id` | Admin, HoD | Get single department detail |
| `PATCH` | `/api/departments/:id` | Admin | Update department name or reassign HoD |

---

### 3.3 Subjects

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `GET` | `/api/subjects` | Admin, HoD | List all subjects globally — filterable by semester, isElective, search |
| `POST` | `/api/subjects` | Admin, HoD | Create a new subject (global, no department ownership) |
| `GET` | `/api/subjects/:id` | Admin, HoD | Get single subject detail including how many classes use it |
| `PATCH` | `/api/subjects/:id` | Admin, HoD | Update subject name, code, or semester |
| `DELETE` | `/api/subjects/:id` | Admin, HoD | Soft delete a subject |

---

### 3.4 Classes

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `GET` | `/api/classes` | Admin, HoD | List all classes — filterable by department, semester, academic year |
| `POST` | `/api/classes` | Admin, HoD | Create a new class with name, department, semester, and class teacher |
| `GET` | `/api/classes/:id` | Admin, HoD | Get full class detail — metadata, subject assignments, student count, active batch status |
| `PATCH` | `/api/classes/:id` | Admin, HoD | Update class metadata (name, academic year) |
| `DELETE` | `/api/classes/:id` | Admin, HoD | Soft delete a class |
| `PATCH` | `/api/classes/:id/class-teacher` | Admin, HoD | Assign or change the class teacher for this class |
| `POST` | `/api/classes/:id/subjects` | Admin, HoD | Add a subject assignment — link a subject + faculty to this class (with optional code override) |
| `PATCH` | `/api/classes/:id/subjects/:assignmentId` | Admin, HoD | Reassign faculty or update the subject code override for an existing assignment |
| `DELETE` | `/api/classes/:id/subjects/:assignmentId` | Admin, HoD | Remove a subject assignment from this class |
| `POST` | `/api/classes/:id/clone-subjects` | Admin, HoD | Copy all subject entries from another class — faculty fields cleared for reassignment (used for multi-section setup) |

---

### 3.5 Faculty

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `GET` | `/api/faculty` | Admin, HoD | List all faculty — filterable by department, roleTag, search |
| `POST` | `/api/faculty` | Admin, HoD | Create faculty account — auto-generates credentials and sends email |
| `GET` | `/api/faculty/:id` | Admin, HoD | Get single faculty detail with role tags and last login |
| `PATCH` | `/api/faculty/:id` | Admin, HoD | Update faculty info — name, email, phone, role tags |
| `DELETE` | `/api/faculty/:id` | Admin, HoD | Soft delete / deactivate faculty account |
| `GET` | `/api/faculty/:id/classes` | Admin, HoD | List all classes this faculty is assigned to, with subjects taught per class |

---

### 3.6 Students

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `GET` | `/api/students` | Admin, HoD | List all students — filterable by class, department, semester, roll number search |
| `POST` | `/api/students` | Admin, HoD | Create a single student account manually |
| `GET` | `/api/students/:id` | Admin, HoD | Get full student detail — mentor, electives, current no-due status |
| `PATCH` | `/api/students/:id` | Admin, HoD | Update student details — email, year of study |
| `DELETE` | `/api/students/:id` | Admin, HoD | Soft delete / deactivate student account |
| `PATCH` | `/api/students/:id/mentor` | Admin, HoD | Assign or change this student's mentor (individual assignment) |
| `POST` | `/api/students/:id/electives` | Admin, HoD | Add an elective subject assignment for this student |
| `PATCH` | `/api/students/:id/electives/:assignmentId` | Admin, HoD | Reassign the faculty for an existing elective |
| `DELETE` | `/api/students/:id/electives/:assignmentId` | Admin, HoD | Remove an elective assignment from this student |

---

### 3.7 Import

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `POST` | `/api/import/students/preview` | Admin, HoD | Upload student Excel/CSV for a class — parse and validate rows, return preview with errors before committing |
| `POST` | `/api/import/students/commit` | Admin, HoD | Commit validated student rows to DB — bulk insert + send credential emails |
| `POST` | `/api/import/faculty/preview` | Admin, HoD | Upload faculty Excel/CSV — parse and validate rows, return preview with errors |
| `POST` | `/api/import/faculty/commit` | Admin, HoD | Commit validated faculty rows — bulk insert + send credential emails |
| `POST` | `/api/import/electives/preview` | Admin, HoD | Upload elective assignments (Roll No, Subject Code, Faculty Employee ID) — validate and preview |
| `POST` | `/api/import/electives/commit` | Admin, HoD | Commit elective assignments to DB |
| `POST` | `/api/import/mentors/preview` | Admin, HoD | Upload mentor assignments (Roll No, Faculty Employee ID) — validate and preview |
| `POST` | `/api/import/mentors/commit` | Admin, HoD | Commit mentor assignments to DB |
| `GET` | `/api/import/template/:type` | Admin, HoD | Download pre-formatted Excel template for `students`, `faculty`, `electives`, or `mentors` |

---

### 3.8 Batch

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `GET` | `/api/batch` | Admin, HoD | List all batches — filterable by class, department, semester, year, status |
| `POST` | `/api/batch/initiate` | Admin, HoD | Initiate a no-due batch for a class — creates all request and approval records in one bulk operation |
| `GET` | `/api/batch/:batchId` | Admin, HoD | Get full batch status grid — student-wise summary with cleared/pending/dues counts |
| `GET` | `/api/batch/:batchId/students/:studentId` | Admin, HoD | Get complete approval breakdown for one specific student in a batch |
| `PATCH` | `/api/batch/:batchId/close` | Admin, HoD | Manually close an active batch |
| `POST` | `/api/batch/:batchId/students` | Admin, HoD | Manually add a late-joining student to an already-active batch |
| `DELETE` | `/api/batch/:batchId/faculty/:facultyId` | Admin, HoD | Remove a faculty member from an active batch — deletes their pending approvals, retains actioned ones |

---

### 3.9 Approvals

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `GET` | `/api/approvals/pending` | Faculty | Get all pending approval records for the logged-in faculty across all their active batches |
| `GET` | `/api/approvals/history` | Faculty | Get past actioned approvals by this faculty — paginated, filterable by semester |
| `POST` | `/api/approvals/approve` | Faculty | Approve a specific student's no-due for the faculty's subject or role |
| `POST` | `/api/approvals/mark-due` | Faculty | Mark a due for a student — requires due type (library/lab/fees/attendance/other) and remarks |
| `PATCH` | `/api/approvals/:approvalId` | Faculty | Update a previously submitted action — allowed only while the batch is still active |

---

### 3.10 HoD

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `GET` | `/api/hod/overview` | HoD | Get department-wide summary of all active batches with cleared/pending/dues counts per class |
| `GET` | `/api/hod/dues` | HoD | List all students with `has_dues` status in HoD's department — shows which faculty flagged what |
| `POST` | `/api/hod/override` | HoD | Force-clear a blocked student clearance with an override remark — bypasses faculty dues |

---

### 3.11 Student Portal

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `GET` | `/api/student/status` | Student | Get own current semester no-due status — overall status + per-approval breakdown with subject, faculty, due type, and remarks |
| `GET` | `/api/student/history` | Student | Get past semester no-due records — read-only history |

---

### 3.12 SSE

| Method | Endpoint | Access | Use |
|---|---|---|---|
| `GET` | `/api/sse/connect` | Authenticated | Establish a persistent Server-Sent Events connection — server pushes real-time updates for approvals, batch events, and overrides without polling |

---

## 4. Auth Endpoints

### POST `/api/auth/login`
Admin and Faculty login.

**Access:** Public

**Request:**
```json
{
  "email": "dr.sharma@mits.ac.in",
  "password": "EMP042@Mits#3916"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userId": "6627a3f2e4b0c9d8f1234567",
    "name": "Dr. Sharma",
    "email": "dr.sharma@mits.ac.in",
    "role": "faculty",
    "roleTags": ["faculty", "classTeacher"],
    "departmentId": "6627a3f2e4b0c9d8f0000001",
    "departmentName": "CSE",
    "mustChangePassword": false
  }
}
```
> Sets `nds_token` httpOnly cookie.

**Response 401:**
```json
{
  "success": false,
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "statusCode": 401
  }
}
```

---

### POST `/api/auth/student-login`
Student login — roll number only, no password.

**Access:** Public

**Request:**
```json
{
  "rollNo": "21CSE001"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userId": "6627a3f2e4b0c9d8f9999999",
    "name": "Riya Sharma",
    "rollNo": "21CSE001",
    "role": "student",
    "classId": "6627a3f2e4b0c9d8f0000010",
    "className": "CSE-A Sem 5",
    "departmentName": "CSE",
    "semester": 5
  }
}
```

**Response 401:**
```json
{
  "success": false,
  "error": {
    "code": "AUTH_ROLL_NOT_FOUND",
    "message": "No student found with this roll number",
    "statusCode": 401
  }
}
```

---

### POST `/api/auth/change-password`
Force password change on first login.

**Access:** Any authenticated non-student role

**Request:**
```json
{
  "newPassword": "MySecurePass@123",
  "confirmPassword": "MySecurePass@123"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": "Password changed successfully"
  }
}
```

---

### POST `/api/auth/logout`

**Access:** Any authenticated

**Request:** _(no body)_

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```
> Clears `nds_token` cookie.

---

### GET `/api/auth/me`
Returns current user session info.

**Access:** Any authenticated

**Response 200 (faculty example):**
```json
{
  "success": true,
  "data": {
    "userId": "6627a3f2e4b0c9d8f1234567",
    "name": "Dr. Sharma",
    "email": "dr.sharma@mits.ac.in",
    "role": "faculty",
    "roleTags": ["faculty", "classTeacher"],
    "departmentId": "6627a3f2e4b0c9d8f0000001",
    "departmentName": "CSE",
    "mustChangePassword": false
  }
}
```

---

## 5. Department Endpoints

### GET `/api/departments`

**Access:** Admin

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "6627a3f2e4b0c9d8f0000001",
      "name": "CSE",
      "hod": {
        "_id": "6627a3f2e4b0c9d8f1234567",
        "name": "Dr. Mehta",
        "email": "dr.mehta@mits.ac.in"
      },
      "classCount": 5,
      "activeBatchCount": 3,
      "createdAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "_id": "6627a3f2e4b0c9d8f0000002",
      "name": "ECE",
      "hod": {
        "_id": "6627a3f2e4b0c9d8f1234568",
        "name": "Dr. Rao",
        "email": "dr.rao@mits.ac.in"
      },
      "classCount": 4,
      "activeBatchCount": 2,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST `/api/departments`

**Access:** Admin only

**Request:**
```json
{
  "name": "CSD",
  "hodId": "6627a3f2e4b0c9d8f1234570"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0000003",
    "name": "CSD",
    "hodId": "6627a3f2e4b0c9d8f1234570",
    "createdAt": "2026-04-11T10:00:00.000Z"
  }
}
```

---

### GET `/api/departments/:id`

**Access:** Admin, HoD (own only)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0000001",
    "name": "CSE",
    "hod": {
      "_id": "6627a3f2e4b0c9d8f1234567",
      "name": "Dr. Mehta",
      "email": "dr.mehta@mits.ac.in",
      "employeeId": "EMP001"
    },
    "classCount": 5,
    "activeBatchCount": 3,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### PATCH `/api/departments/:id`

**Access:** Admin only

**Request:**
```json
{
  "hodId": "6627a3f2e4b0c9d8f1234571"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0000001",
    "name": "CSE",
    "hodId": "6627a3f2e4b0c9d8f1234571"
  }
}
```

---

## 6. Subject Endpoints

### GET `/api/subjects`

**Access:** Admin, HoD

**Query Params:** `?semester=5&isElective=false&search=maths`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "6627a3f2e4b0c9d8f0001001",
      "name": "Engineering Mathematics",
      "code": "MA301",
      "semester": 3,
      "isElective": false,
      "createdAt": "2026-01-15T00:00:00.000Z"
    },
    {
      "_id": "6627a3f2e4b0c9d8f0001002",
      "name": "Database Management Systems",
      "code": "CS501",
      "semester": 5,
      "isElective": false,
      "createdAt": "2026-01-15T00:00:00.000Z"
    },
    {
      "_id": "6627a3f2e4b0c9d8f0001010",
      "name": "Machine Learning",
      "code": "CS601E",
      "semester": 6,
      "isElective": true,
      "createdAt": "2026-01-15T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 24,
    "pages": 2
  }
}
```

---

### POST `/api/subjects`

**Access:** Admin, HoD

**Request:**
```json
{
  "name": "Aptitude and Reasoning",
  "code": "APT301",
  "semester": 3,
  "isElective": false
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0001020",
    "name": "Aptitude and Reasoning",
    "code": "APT301",
    "semester": 3,
    "isElective": false,
    "createdAt": "2026-04-11T10:00:00.000Z"
  }
}
```

---

### GET `/api/subjects/:id`

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0001001",
    "name": "Engineering Mathematics",
    "code": "MA301",
    "semester": 3,
    "isElective": false,
    "usedInClasses": 8,
    "createdAt": "2026-01-15T00:00:00.000Z"
  }
}
```

---

### PATCH `/api/subjects/:id`

**Access:** Admin, HoD

**Request:**
```json
{
  "name": "Engineering Mathematics III",
  "code": "MA301"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0001001",
    "name": "Engineering Mathematics III",
    "code": "MA301",
    "semester": 3,
    "isElective": false
  }
}
```

---

### DELETE `/api/subjects/:id`

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": "Subject deleted successfully"
  }
}
```

---

## 7. Class Endpoints

### GET `/api/classes`

**Access:** Admin, HoD

**Query Params:** `?departmentId=xxx&semester=5&academicYear=2025-26&status=active`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "6627a3f2e4b0c9d8f0000010",
      "name": "CSE-A Sem 5",
      "departmentId": "6627a3f2e4b0c9d8f0000001",
      "departmentName": "CSE",
      "semester": 5,
      "academicYear": "2025-26",
      "classTeacher": {
        "_id": "6627a3f2e4b0c9d8f1234568",
        "name": "Dr. Patel"
      },
      "studentCount": 65,
      "subjectCount": 6,
      "hasActiveBatch": true,
      "isActive": true
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 10, "pages": 1 }
}
```

---

### POST `/api/classes`

**Access:** Admin, HoD

**Request:**
```json
{
  "name": "CSD-B Sem 3",
  "departmentId": "6627a3f2e4b0c9d8f0000003",
  "semester": 3,
  "academicYear": "2025-26",
  "classTeacherId": "6627a3f2e4b0c9d8f1234580"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0000020",
    "name": "CSD-B Sem 3",
    "departmentId": "6627a3f2e4b0c9d8f0000003",
    "semester": 3,
    "academicYear": "2025-26",
    "classTeacherId": "6627a3f2e4b0c9d8f1234580",
    "subjectAssignments": [],
    "studentIds": [],
    "isActive": true,
    "createdAt": "2026-04-11T10:00:00.000Z"
  }
}
```

---

### GET `/api/classes/:id`

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0000010",
    "name": "CSE-A Sem 5",
    "departmentId": "6627a3f2e4b0c9d8f0000001",
    "departmentName": "CSE",
    "semester": 5,
    "academicYear": "2025-26",
    "classTeacher": {
      "_id": "6627a3f2e4b0c9d8f1234568",
      "name": "Dr. Patel",
      "email": "dr.patel@mits.ac.in",
      "employeeId": "EMP002"
    },
    "subjectAssignments": [
      {
        "_id": "assign_001",
        "subjectId": "6627a3f2e4b0c9d8f0001002",
        "subjectName": "Database Management Systems",
        "subjectCode": "CS501",
        "isElective": false,
        "faculty": {
          "_id": "6627a3f2e4b0c9d8f1234567",
          "name": "Dr. Sharma",
          "employeeId": "EMP001"
        }
      },
      {
        "_id": "assign_002",
        "subjectId": "6627a3f2e4b0c9d8f0001001",
        "subjectName": "Engineering Mathematics",
        "subjectCode": "MA502",
        "isElective": false,
        "faculty": {
          "_id": "6627a3f2e4b0c9d8f1234569",
          "name": "Dr. Meena",
          "employeeId": "EMP003"
        }
      }
    ],
    "studentCount": 65,
    "hasActiveBatch": true,
    "activeBatchId": "6627a3f2e4b0c9d8f0002001",
    "isActive": true,
    "createdAt": "2026-01-15T00:00:00.000Z"
  }
}
```

---

### PATCH `/api/classes/:id`

**Access:** Admin, HoD

**Request:**
```json
{
  "name": "CSE-A Sem 6",
  "academicYear": "2026-27"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0000010",
    "name": "CSE-A Sem 6",
    "academicYear": "2026-27"
  }
}
```

---

### DELETE `/api/classes/:id`

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Class deleted successfully" }
}
```

---

### PATCH `/api/classes/:id/class-teacher`

**Access:** Admin, HoD

**Request:**
```json
{
  "classTeacherId": "6627a3f2e4b0c9d8f1234570"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "classId": "6627a3f2e4b0c9d8f0000010",
    "classTeacher": {
      "_id": "6627a3f2e4b0c9d8f1234570",
      "name": "Dr. Kumar",
      "employeeId": "EMP010"
    }
  }
}
```

---

### POST `/api/classes/:id/subjects`
Add a subject assignment to a class.

**Access:** Admin, HoD

**Request:**
```json
{
  "subjectId": "6627a3f2e4b0c9d8f0001001",
  "facultyId": "6627a3f2e4b0c9d8f1234569",
  "subjectCode": "MA502"
}
```
> `subjectCode` is optional — only set if the code differs from the subject's default code.

**Response 201:**
```json
{
  "success": true,
  "data": {
    "assignmentId": "assign_003",
    "subjectId": "6627a3f2e4b0c9d8f0001001",
    "subjectName": "Engineering Mathematics",
    "subjectCode": "MA502",
    "faculty": {
      "_id": "6627a3f2e4b0c9d8f1234569",
      "name": "Dr. Meena",
      "employeeId": "EMP003"
    }
  }
}
```

---

### PATCH `/api/classes/:id/subjects/:assignmentId`
Reassign faculty or update code override for an existing subject assignment.

**Access:** Admin, HoD

**Request:**
```json
{
  "facultyId": "6627a3f2e4b0c9d8f1234575",
  "subjectCode": "MA503"
}
```
> Both fields are optional — send only what needs updating.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "assignmentId": "assign_003",
    "subjectId": "6627a3f2e4b0c9d8f0001001",
    "subjectName": "Engineering Mathematics",
    "subjectCode": "MA503",
    "faculty": {
      "_id": "6627a3f2e4b0c9d8f1234575",
      "name": "Dr. Nair",
      "employeeId": "EMP015"
    }
  }
}
```

---

### DELETE `/api/classes/:id/subjects/:assignmentId`

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Subject assignment removed" }
}
```

---

### POST `/api/classes/:id/clone-subjects`
Copy subject list from another class. Copies subjectIds and subjectCodes — faculty assignments are cleared for reassignment.

**Access:** Admin, HoD

**Request:**
```json
{
  "sourceClassId": "6627a3f2e4b0c9d8f0000011"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "classId": "6627a3f2e4b0c9d8f0000020",
    "clonedFrom": "6627a3f2e4b0c9d8f0000011",
    "subjectsCloned": 6,
    "message": "6 subjects copied. Please assign faculty for each subject.",
    "subjectAssignments": [
      {
        "assignmentId": "assign_101",
        "subjectId": "6627a3f2e4b0c9d8f0001002",
        "subjectName": "Database Management Systems",
        "subjectCode": "CS501",
        "faculty": null
      },
      {
        "assignmentId": "assign_102",
        "subjectId": "6627a3f2e4b0c9d8f0001001",
        "subjectName": "Engineering Mathematics",
        "subjectCode": "MA502",
        "faculty": null
      }
    ]
  }
}
```

---

## 8. Faculty Endpoints

### GET `/api/faculty`

**Access:** Admin, HoD

**Query Params:** `?departmentId=xxx&roleTag=classTeacher&search=sharma`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "6627a3f2e4b0c9d8f1234567",
      "name": "Dr. Sharma",
      "email": "dr.sharma@mits.ac.in",
      "phone": "9876543210",
      "employeeId": "EMP001",
      "departmentId": "6627a3f2e4b0c9d8f0000001",
      "departmentName": "CSE",
      "roleTags": ["faculty", "classTeacher"],
      "classCount": 2,
      "isActive": true,
      "lastLoginAt": "2026-04-10T09:30:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 30, "pages": 2 }
}
```

---

### POST `/api/faculty`
Creates faculty account and sends credential email.

**Access:** Admin, HoD

**Request:**
```json
{
  "name": "Dr. Rao",
  "email": "dr.rao@mits.ac.in",
  "phone": "9876500001",
  "employeeId": "EMP031",
  "departmentId": "6627a3f2e4b0c9d8f0000001",
  "roleTags": ["faculty", "mentor"]
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f1234590",
    "name": "Dr. Rao",
    "email": "dr.rao@mits.ac.in",
    "employeeId": "EMP031",
    "departmentId": "6627a3f2e4b0c9d8f0000001",
    "departmentName": "CSE",
    "roleTags": ["faculty", "mentor"],
    "mustChangePassword": true,
    "credentialEmailSent": true,
    "isActive": true,
    "createdAt": "2026-04-11T10:00:00.000Z"
  }
}
```

---

### GET `/api/faculty/:id`

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f1234567",
    "name": "Dr. Sharma",
    "email": "dr.sharma@mits.ac.in",
    "phone": "9876543210",
    "employeeId": "EMP001",
    "departmentId": "6627a3f2e4b0c9d8f0000001",
    "departmentName": "CSE",
    "roleTags": ["faculty", "classTeacher"],
    "mustChangePassword": false,
    "isActive": true,
    "lastLoginAt": "2026-04-10T09:30:00.000Z",
    "createdAt": "2026-01-15T00:00:00.000Z"
  }
}
```

---

### PATCH `/api/faculty/:id`

**Access:** Admin, HoD

**Request:**
```json
{
  "phone": "9876500099",
  "roleTags": ["faculty", "classTeacher", "mentor"]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f1234567",
    "name": "Dr. Sharma",
    "roleTags": ["faculty", "classTeacher", "mentor"]
  }
}
```

---

### DELETE `/api/faculty/:id`

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Faculty account deactivated" }
}
```

---

### GET `/api/faculty/:id/classes`

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "6627a3f2e4b0c9d8f0000010",
      "name": "CSE-A Sem 5",
      "semester": 5,
      "academicYear": "2025-26",
      "subjectTaught": "Database Management Systems",
      "subjectCode": "CS501",
      "hasActiveBatch": true
    },
    {
      "_id": "6627a3f2e4b0c9d8f0000011",
      "name": "CSE-B Sem 5",
      "semester": 5,
      "academicYear": "2025-26",
      "subjectTaught": "Database Management Systems",
      "subjectCode": "CS501",
      "hasActiveBatch": true
    }
  ]
}
```

---

## 9. Student Endpoints

### GET `/api/students`

**Access:** Admin, HoD

**Query Params:** `?classId=xxx&departmentId=xxx&semester=5&search=21CSE001`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "6627a3f2e4b0c9d8f9999999",
      "rollNo": "21CSE001",
      "name": "Riya Sharma",
      "email": "riya@mits.ac.in",
      "departmentName": "CSE",
      "classId": "6627a3f2e4b0c9d8f0000010",
      "className": "CSE-A Sem 5",
      "semester": 5,
      "yearOfStudy": 3,
      "mentor": {
        "_id": "6627a3f2e4b0c9d8f1234569",
        "name": "Dr. Meena"
      },
      "electiveCount": 1,
      "isActive": true
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 65, "pages": 4 }
}
```

---

### POST `/api/students`

**Access:** Admin, HoD

**Request:**
```json
{
  "rollNo": "21CSE066",
  "name": "Arjun Nair",
  "email": "arjun@mits.ac.in",
  "classId": "6627a3f2e4b0c9d8f0000010",
  "semester": 5,
  "yearOfStudy": 3,
  "academicYear": "2025-26"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f9999100",
    "rollNo": "21CSE066",
    "name": "Arjun Nair",
    "email": "arjun@mits.ac.in",
    "classId": "6627a3f2e4b0c9d8f0000010",
    "className": "CSE-A Sem 5",
    "departmentName": "CSE",
    "semester": 5,
    "yearOfStudy": 3,
    "credentialEmailSent": true,
    "isActive": true,
    "createdAt": "2026-04-11T10:00:00.000Z"
  }
}
```

---

### GET `/api/students/:id`

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f9999999",
    "rollNo": "21CSE001",
    "name": "Riya Sharma",
    "email": "riya@mits.ac.in",
    "departmentName": "CSE",
    "classId": "6627a3f2e4b0c9d8f0000010",
    "className": "CSE-A Sem 5",
    "semester": 5,
    "yearOfStudy": 3,
    "academicYear": "2025-26",
    "mentor": {
      "_id": "6627a3f2e4b0c9d8f1234569",
      "name": "Dr. Meena",
      "employeeId": "EMP003"
    },
    "electiveSubjects": [
      {
        "assignmentId": "elec_001",
        "subjectId": "6627a3f2e4b0c9d8f0001010",
        "subjectName": "Machine Learning",
        "subjectCode": "CS601E",
        "faculty": {
          "_id": "6627a3f2e4b0c9d8f1234580",
          "name": "Dr. Krishnan",
          "employeeId": "EMP020"
        }
      }
    ],
    "currentNoDueStatus": "pending",
    "isActive": true,
    "createdAt": "2026-01-15T00:00:00.000Z"
  }
}
```

---

### PATCH `/api/students/:id`

**Access:** Admin, HoD

**Request:**
```json
{
  "email": "riya.sharma@mits.ac.in",
  "yearOfStudy": 3
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f9999999",
    "rollNo": "21CSE001",
    "name": "Riya Sharma",
    "email": "riya.sharma@mits.ac.in"
  }
}
```

---

### PATCH `/api/students/:id/mentor`

**Access:** Admin, HoD

**Request:**
```json
{
  "mentorId": "6627a3f2e4b0c9d8f1234569"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "studentId": "6627a3f2e4b0c9d8f9999999",
    "mentor": {
      "_id": "6627a3f2e4b0c9d8f1234569",
      "name": "Dr. Meena",
      "employeeId": "EMP003"
    }
  }
}
```

---

### POST `/api/students/:id/electives`

**Access:** Admin, HoD

**Request:**
```json
{
  "subjectId": "6627a3f2e4b0c9d8f0001010",
  "facultyId": "6627a3f2e4b0c9d8f1234580"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "assignmentId": "elec_001",
    "subjectId": "6627a3f2e4b0c9d8f0001010",
    "subjectName": "Machine Learning",
    "subjectCode": "CS601E",
    "faculty": {
      "_id": "6627a3f2e4b0c9d8f1234580",
      "name": "Dr. Krishnan"
    }
  }
}
```

---

### PATCH `/api/students/:id/electives/:assignmentId`

**Access:** Admin, HoD

**Request:**
```json
{
  "facultyId": "6627a3f2e4b0c9d8f1234581"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "assignmentId": "elec_001",
    "subjectName": "Machine Learning",
    "faculty": {
      "_id": "6627a3f2e4b0c9d8f1234581",
      "name": "Dr. Pillai"
    }
  }
}
```

---

### DELETE `/api/students/:id/electives/:assignmentId`

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Elective removed" }
}
```

---

## 10. Import Endpoints

All import endpoints accept `multipart/form-data` with a file field named `file`.

### POST `/api/import/students/preview`

**Access:** Admin, HoD

**Query Params:** `?classId=6627a3f2e4b0c9d8f0000010` ← required, classId from URL context

**Request:** `multipart/form-data` — field: `file` (.xlsx or .csv)

**Excel columns required:** `Roll No | Name | Email`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "valid": [
      { "rollNo": "21CSE001", "name": "Riya Sharma", "email": "riya@mits.ac.in" },
      { "rollNo": "21CSE002", "name": "Arjun Nair", "email": "arjun@mits.ac.in" }
    ],
    "errors": [
      { "row": 14, "data": { "rollNo": "21CSE014", "name": "Priya K" }, "reason": "Roll number already exists in database" },
      { "row": 22, "data": { "rollNo": "", "name": "Kumar" }, "reason": "Roll number is required" },
      { "row": 35, "data": { "rollNo": "21CSE035", "name": "Deepa" }, "reason": "Invalid email format" }
    ],
    "summary": {
      "total": 65,
      "valid": 62,
      "errors": 3
    }
  }
}
```

---

### POST `/api/import/students/commit`

**Access:** Admin, HoD

**Request:**
```json
{
  "classId": "6627a3f2e4b0c9d8f0000010",
  "semester": 5,
  "yearOfStudy": 3,
  "academicYear": "2025-26",
  "rows": [
    { "rollNo": "21CSE001", "name": "Riya Sharma", "email": "riya@mits.ac.in" },
    { "rollNo": "21CSE002", "name": "Arjun Nair", "email": "arjun@mits.ac.in" }
  ]
}
```
> Send only the `valid` array from the preview response.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "inserted": 62,
    "credentialEmailsSent": 62,
    "failed": 0,
    "message": "62 students created successfully"
  }
}
```

---

### POST `/api/import/electives/preview`

**Access:** Admin, HoD

**Excel columns required:** `Roll No | Subject Code | Faculty Employee ID`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "valid": [
      {
        "rollNo": "21CSE001",
        "studentName": "Riya Sharma",
        "subjectCode": "CS601E",
        "subjectName": "Machine Learning",
        "facultyEmployeeId": "EMP020",
        "facultyName": "Dr. Krishnan"
      }
    ],
    "errors": [
      { "row": 5, "data": { "rollNo": "21CSE005", "subjectCode": "CS999" }, "reason": "Subject code CS999 not found" }
    ],
    "summary": { "total": 40, "valid": 39, "errors": 1 }
  }
}
```

---

### POST `/api/import/electives/commit`

**Access:** Admin, HoD

**Request:**
```json
{
  "rows": [
    {
      "rollNo": "21CSE001",
      "subjectCode": "CS601E",
      "facultyEmployeeId": "EMP020"
    }
  ]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "assigned": 39,
    "failed": 0,
    "message": "39 elective assignments created"
  }
}
```

---

### POST `/api/import/mentors/preview`

**Access:** Admin, HoD

**Excel columns required:** `Roll No | Faculty Employee ID`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "valid": [
      { "rollNo": "21CSE001", "studentName": "Riya Sharma", "facultyEmployeeId": "EMP003", "facultyName": "Dr. Meena" },
      { "rollNo": "21CSE002", "studentName": "Arjun Nair", "facultyEmployeeId": "EMP003", "facultyName": "Dr. Meena" }
    ],
    "errors": [],
    "summary": { "total": 15, "valid": 15, "errors": 0 }
  }
}
```

---

### POST `/api/import/mentors/commit`

**Access:** Admin, HoD

**Request:**
```json
{
  "rows": [
    { "rollNo": "21CSE001", "facultyEmployeeId": "EMP003" },
    { "rollNo": "21CSE002", "facultyEmployeeId": "EMP003" }
  ]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "assigned": 15,
    "failed": 0,
    "message": "15 mentor assignments updated"
  }
}
```

---

### GET `/api/import/template/:type`

**Access:** Admin, HoD

**Params:** `type` = `students` | `faculty` | `electives` | `mentors`

**Response:** Binary file download (`.xlsx`)

> Returns an Excel file with correct column headers pre-filled. Frontend triggers download using `window.open` or a blob URL.

---

## 11. Batch Endpoints

### GET `/api/batch`

**Access:** Admin, HoD

**Query Params:** `?classId=xxx&departmentId=xxx&semester=5&academicYear=2025-26&status=active`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "6627a3f2e4b0c9d8f0002001",
      "classId": "6627a3f2e4b0c9d8f0000010",
      "className": "CSE-A Sem 5",
      "departmentName": "CSE",
      "semester": 5,
      "academicYear": "2025-26",
      "initiatedBy": {
        "_id": "6627a3f2e4b0c9d8f0099999",
        "name": "Admin"
      },
      "initiatedAt": "2026-05-01T09:00:00.000Z",
      "deadline": "2026-05-15T23:59:00.000Z",
      "status": "active",
      "totalStudents": 65,
      "summary": {
        "cleared": 20,
        "pending": 40,
        "hasDues": 5,
        "hodOverride": 0
      }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 8, "pages": 1 }
}
```

---

### POST `/api/batch/initiate`

**Access:** Admin, HoD

**Request:**
```json
{
  "classId": "6627a3f2e4b0c9d8f0000010",
  "semester": 5,
  "academicYear": "2025-26",
  "deadline": "2026-05-15T23:59:00.000Z"
}
```
> `deadline` is optional.

**Response 201:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0002001",
    "classId": "6627a3f2e4b0c9d8f0000010",
    "className": "CSE-A Sem 5",
    "semester": 5,
    "academicYear": "2025-26",
    "status": "active",
    "totalStudents": 65,
    "totalApprovalRecords": 520,
    "initiatedAt": "2026-05-01T09:00:00.000Z",
    "deadline": "2026-05-15T23:59:00.000Z"
  }
}
```

**Possible Errors:**
```json
{ "error": { "code": "BATCH_ALREADY_EXISTS", "statusCode": 409 } }
{ "error": { "code": "BATCH_NO_STUDENTS", "statusCode": 400 } }
{ "error": { "code": "BATCH_NO_SUBJECTS", "statusCode": 400 } }
{ "error": { "code": "BATCH_NO_CLASS_TEACHER", "statusCode": 400 } }
```

---

### GET `/api/batch/:batchId`
Full batch status grid — student-wise summary.

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f0002001",
    "className": "CSE-A Sem 5",
    "semester": 5,
    "academicYear": "2025-26",
    "status": "active",
    "initiatedAt": "2026-05-01T09:00:00.000Z",
    "deadline": "2026-05-15T23:59:00.000Z",
    "summary": {
      "cleared": 20,
      "pending": 40,
      "hasDues": 5,
      "hodOverride": 0
    },
    "students": [
      {
        "requestId": "6627a3f2e4b0c9d8f0003001",
        "studentId": "6627a3f2e4b0c9d8f9999999",
        "rollNo": "21CSE001",
        "name": "Riya Sharma",
        "overallStatus": "pending",
        "approvalSummary": {
          "approved": 4,
          "pending": 3,
          "duePending": 0
        }
      },
      {
        "requestId": "6627a3f2e4b0c9d8f0003002",
        "studentId": "6627a3f2e4b0c9d8f9999998",
        "rollNo": "21CSE002",
        "name": "Arjun Nair",
        "overallStatus": "has_dues",
        "approvalSummary": {
          "approved": 5,
          "pending": 1,
          "duePending": 1
        }
      }
    ]
  }
}
```

---

### GET `/api/batch/:batchId/students/:studentId`
Full approval breakdown for one student in a batch.

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": {
    "requestId": "6627a3f2e4b0c9d8f0003001",
    "student": {
      "rollNo": "21CSE001",
      "name": "Riya Sharma",
      "departmentName": "CSE"
    },
    "overallStatus": "has_dues",
    "overrideInfo": null,
    "approvals": [
      {
        "approvalId": "6627a3f2e4b0c9d8f0004001",
        "facultyName": "Dr. Sharma",
        "employeeId": "EMP001",
        "subjectName": "Database Management Systems",
        "subjectCode": "CS501",
        "approvalType": "subject",
        "action": "approved",
        "dueType": null,
        "remarks": null,
        "actionedAt": "2026-05-10T14:32:00.000Z"
      },
      {
        "approvalId": "6627a3f2e4b0c9d8f0004002",
        "facultyName": "Dr. Meena",
        "employeeId": "EMP003",
        "subjectName": "Engineering Mathematics",
        "subjectCode": "MA502",
        "approvalType": "subject",
        "action": "due_marked",
        "dueType": "lab",
        "remarks": "Lab record not submitted for experiment 4",
        "actionedAt": "2026-05-09T11:00:00.000Z"
      },
      {
        "approvalId": "6627a3f2e4b0c9d8f0004003",
        "facultyName": "Dr. Patel",
        "employeeId": "EMP002",
        "subjectName": null,
        "subjectCode": null,
        "approvalType": "classTeacher",
        "action": "pending",
        "dueType": null,
        "remarks": null,
        "actionedAt": null
      },
      {
        "approvalId": "6627a3f2e4b0c9d8f0004004",
        "facultyName": "Dr. Meena",
        "employeeId": "EMP003",
        "subjectName": null,
        "subjectCode": null,
        "approvalType": "mentor",
        "action": "approved",
        "dueType": null,
        "remarks": null,
        "actionedAt": "2026-05-10T10:00:00.000Z"
      }
    ]
  }
}
```

---

### PATCH `/api/batch/:batchId/close`

**Access:** Admin, HoD

**Request:** _(no body)_

**Response 200:**
```json
{
  "success": true,
  "data": {
    "batchId": "6627a3f2e4b0c9d8f0002001",
    "status": "closed",
    "closedAt": "2026-05-16T00:00:00.000Z"
  }
}
```

---

### POST `/api/batch/:batchId/students`
Manually add a late student to an active batch.

**Access:** Admin, HoD

**Request:**
```json
{
  "studentId": "6627a3f2e4b0c9d8f9999100"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "requestId": "6627a3f2e4b0c9d8f0003100",
    "student": {
      "rollNo": "21CSE066",
      "name": "Arjun Nair"
    },
    "approvalsCreated": 7,
    "message": "Student added to batch. 7 approval records created."
  }
}
```

---

### DELETE `/api/batch/:batchId/faculty/:facultyId`
Remove a faculty member from an active batch (their pending approvals deleted, actioned ones retained).

**Access:** Admin, HoD

**Response 200:**
```json
{
  "success": true,
  "data": {
    "facultyId": "6627a3f2e4b0c9d8f1234569",
    "facultyName": "Dr. Meena",
    "pendingApprovalsDeleted": 45,
    "actionedApprovalsRetained": 20,
    "message": "Faculty removed from batch. 45 pending approvals deleted."
  }
}
```

---

## 12. Approval Endpoints

### GET `/api/approvals/pending`
All pending approval records for the logged-in faculty across all active batches.

**Access:** Faculty (any roleTag)

**Query Params:** `?classId=xxx&batchId=xxx&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "approvalId": "6627a3f2e4b0c9d8f0004010",
      "batchId": "6627a3f2e4b0c9d8f0002001",
      "className": "CSE-A Sem 5",
      "student": {
        "rollNo": "21CSE001",
        "name": "Riya Sharma",
        "departmentName": "CSE"
      },
      "subjectName": "Database Management Systems",
      "subjectCode": "CS501",
      "approvalType": "subject",
      "action": "pending",
      "createdAt": "2026-05-01T09:00:00.000Z"
    },
    {
      "approvalId": "6627a3f2e4b0c9d8f0004011",
      "batchId": "6627a3f2e4b0c9d8f0002001",
      "className": "CSE-A Sem 5",
      "student": {
        "rollNo": "21CSE002",
        "name": "Arjun Nair",
        "departmentName": "CSE"
      },
      "subjectName": null,
      "subjectCode": null,
      "approvalType": "classTeacher",
      "action": "pending",
      "createdAt": "2026-05-01T09:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 65, "pages": 4 },
  "meta": {
    "totalPending": 65,
    "batchesInvolved": 2
  }
}
```

---

### GET `/api/approvals/history`
Past actioned approvals by this faculty.

**Access:** Faculty

**Query Params:** `?semester=5&academicYear=2025-26&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "approvalId": "6627a3f2e4b0c9d8f0004001",
      "className": "CSE-A Sem 5",
      "student": {
        "rollNo": "21CSE001",
        "name": "Riya Sharma"
      },
      "subjectName": "Database Management Systems",
      "approvalType": "subject",
      "action": "approved",
      "dueType": null,
      "remarks": null,
      "actionedAt": "2026-05-10T14:32:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 130, "pages": 7 }
}
```

---

### POST `/api/approvals/approve`

**Access:** Faculty

**Request:**
```json
{
  "approvalId": "6627a3f2e4b0c9d8f0004010"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "approvalId": "6627a3f2e4b0c9d8f0004010",
    "action": "approved",
    "actionedAt": "2026-05-10T14:32:00.000Z",
    "student": {
      "rollNo": "21CSE001",
      "name": "Riya Sharma"
    },
    "requestStatus": "pending"
  }
}
```
> `requestStatus` reflects the updated overall status of the student's no-due request after this action.

---

### POST `/api/approvals/mark-due`

**Access:** Faculty

**Request:**
```json
{
  "approvalId": "6627a3f2e4b0c9d8f0004010",
  "dueType": "lab",
  "remarks": "Lab record not submitted for experiment 4"
}
```

**Allowed `dueType` values:** `library | lab | fees | attendance | other`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "approvalId": "6627a3f2e4b0c9d8f0004010",
    "action": "due_marked",
    "dueType": "lab",
    "remarks": "Lab record not submitted for experiment 4",
    "actionedAt": "2026-05-10T15:00:00.000Z",
    "student": {
      "rollNo": "21CSE001",
      "name": "Riya Sharma"
    },
    "requestStatus": "has_dues"
  }
}
```

---

### PATCH `/api/approvals/:approvalId`
Update a previously submitted action. Only allowed while batch is active.

**Access:** Faculty (must be owner of the approval)

**Request:**
```json
{
  "action": "approved",
  "dueType": null,
  "remarks": null
}
```
> To change from `due_marked` back to `approved`: set `action: "approved"`, `dueType: null`, `remarks: null`.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "approvalId": "6627a3f2e4b0c9d8f0004010",
    "action": "approved",
    "dueType": null,
    "remarks": null,
    "actionedAt": "2026-05-10T16:00:00.000Z",
    "requestStatus": "pending"
  }
}
```

---

## 13. HoD Endpoints

### GET `/api/hod/overview`
All active batches in HoD's department.

**Access:** HoD

**Response 200:**
```json
{
  "success": true,
  "data": {
    "departmentName": "CSE",
    "activeBatches": [
      {
        "batchId": "6627a3f2e4b0c9d8f0002001",
        "className": "CSE-A Sem 5",
        "initiatedAt": "2026-05-01T09:00:00.000Z",
        "deadline": "2026-05-15T23:59:00.000Z",
        "summary": {
          "total": 65,
          "cleared": 20,
          "pending": 40,
          "hasDues": 5,
          "hodOverride": 0
        }
      }
    ],
    "totalHasDues": 12,
    "totalPending": 180
  }
}
```

---

### GET `/api/hod/dues`
All `has_dues` requests in HoD's department requiring override attention.

**Access:** HoD

**Query Params:** `?classId=xxx&batchId=xxx&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "requestId": "6627a3f2e4b0c9d8f0003002",
      "batchId": "6627a3f2e4b0c9d8f0002001",
      "className": "CSE-A Sem 5",
      "student": {
        "rollNo": "21CSE002",
        "name": "Arjun Nair",
        "departmentName": "CSE"
      },
      "duesDetail": [
        {
          "facultyName": "Dr. Meena",
          "employeeId": "EMP003",
          "subjectName": "Engineering Mathematics",
          "approvalType": "subject",
          "dueType": "lab",
          "remarks": "Lab record not submitted for experiment 4",
          "actionedAt": "2026-05-09T11:00:00.000Z"
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 12, "pages": 1 }
}
```

---

### POST `/api/hod/override`

**Access:** HoD

**Request:**
```json
{
  "requestId": "6627a3f2e4b0c9d8f0003002",
  "overrideRemark": "Lab record submitted physically, verified by HoD"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "requestId": "6627a3f2e4b0c9d8f0003002",
    "student": {
      "rollNo": "21CSE002",
      "name": "Arjun Nair"
    },
    "status": "hod_override",
    "overriddenBy": {
      "_id": "6627a3f2e4b0c9d8f1234567",
      "name": "Dr. Mehta"
    },
    "overrideRemark": "Lab record submitted physically, verified by HoD",
    "overriddenAt": "2026-05-12T10:00:00.000Z"
  }
}
```

---

## 14. Student Portal Endpoints

### GET `/api/student/status`
Current semester no-due status for the logged-in student.

**Access:** Student

**Response 200:**
```json
{
  "success": true,
  "data": {
    "rollNo": "21CSE001",
    "name": "Riya Sharma",
    "departmentName": "CSE",
    "className": "CSE-A Sem 5",
    "semester": 5,
    "academicYear": "2025-26",
    "overallStatus": "has_dues",
    "batchId": "6627a3f2e4b0c9d8f0002001",
    "deadline": "2026-05-15T23:59:00.000Z",
    "overrideInfo": null,
    "approvals": [
      {
        "approvalId": "6627a3f2e4b0c9d8f0004001",
        "subjectName": "Database Management Systems",
        "subjectCode": "CS501",
        "facultyName": "Dr. Sharma",
        "approvalType": "subject",
        "action": "approved",
        "dueType": null,
        "remarks": null,
        "actionedAt": "2026-05-10T14:32:00.000Z"
      },
      {
        "approvalId": "6627a3f2e4b0c9d8f0004002",
        "subjectName": "Engineering Mathematics",
        "subjectCode": "MA502",
        "facultyName": "Dr. Meena",
        "approvalType": "subject",
        "action": "due_marked",
        "dueType": "lab",
        "remarks": "Lab record not submitted for experiment 4",
        "actionedAt": "2026-05-09T11:00:00.000Z"
      },
      {
        "approvalId": "6627a3f2e4b0c9d8f0004003",
        "subjectName": "Machine Learning",
        "subjectCode": "CS601E",
        "facultyName": "Dr. Krishnan",
        "approvalType": "subject",
        "action": "pending",
        "dueType": null,
        "remarks": null,
        "actionedAt": null
      },
      {
        "approvalId": "6627a3f2e4b0c9d8f0004004",
        "subjectName": null,
        "subjectCode": null,
        "facultyName": "Dr. Patel",
        "approvalType": "classTeacher",
        "action": "approved",
        "dueType": null,
        "remarks": null,
        "actionedAt": "2026-05-10T09:00:00.000Z"
      },
      {
        "approvalId": "6627a3f2e4b0c9d8f0004005",
        "subjectName": null,
        "subjectCode": null,
        "facultyName": "Dr. Meena",
        "approvalType": "mentor",
        "action": "pending",
        "dueType": null,
        "remarks": null,
        "actionedAt": null
      }
    ]
  }
}
```

> When `overallStatus` is `hod_override`, the `overrideInfo` field will be:
```json
"overrideInfo": {
  "overriddenBy": "Dr. Mehta",
  "overrideRemark": "Lab record submitted physically, verified by HoD",
  "overriddenAt": "2026-05-12T10:00:00.000Z"
}
```

---

### GET `/api/student/history`
Past semester no-due records.

**Access:** Student

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "batchId": "6627a3f2e4b0c9d8f0001999",
      "semester": 4,
      "academicYear": "2024-25",
      "className": "CSE-A Sem 4",
      "overallStatus": "cleared",
      "clearedAt": "2025-11-20T00:00:00.000Z"
    }
  ]
}
```

---

## 15. SSE Endpoint

### GET `/api/sse/connect`
Establish a persistent Server-Sent Events connection.

**Access:** Any authenticated role

**Headers set by server:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Connection key by role:**
```
admin:{userId}    → receives all batch events across departments
hod:{userId}      → receives events scoped to their department
faculty:{userId}  → receives their pending list update events
student:{userId}  → receives their own status update events
```

**Initial event on connect:**
```
event: connected
data: {"message": "SSE connection established", "userId": "6627..."}
```

**Heartbeat (every 30s to prevent timeout):**
```
event: heartbeat
data: {"timestamp": "2026-05-10T14:32:00.000Z"}
```

---

## 16. Error Reference

### Standard Error Shape
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "statusCode": 400
  }
}
```

### All Error Codes

| Code | HTTP | Trigger |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `AUTH_ROLL_NOT_FOUND` | 401 | Roll number not in DB |
| `AUTH_PASSWORD_CHANGE_REQUIRED` | 403 | `mustChangePassword: true` |
| `AUTH_UNAUTHORIZED` | 403 | No valid JWT cookie |
| `AUTH_FORBIDDEN_DEPARTMENT` | 403 | HoD accessing another dept's data |
| `BATCH_ALREADY_EXISTS` | 409 | Active batch exists for class+sem+year |
| `BATCH_NOT_ACTIVE` | 400 | Action on a closed batch |
| `BATCH_NO_STUDENTS` | 400 | Class has no students at initiation |
| `BATCH_NO_SUBJECTS` | 400 | Class has no subject assignments |
| `BATCH_NO_CLASS_TEACHER` | 400 | Class teacher not assigned |
| `APPROVAL_NOT_FOUND` | 404 | Invalid approvalId |
| `APPROVAL_WRONG_FACULTY` | 403 | Approval doesn't belong to this faculty |
| `APPROVAL_ALREADY_ACTIONED` | 409 | Already approved/marked (when edit not allowed) |
| `IMPORT_VALIDATION_FAILED` | 422 | All rows failed validation in commit |
| `DUPLICATE_ROLL_NO` | 409 | Roll number collision on single student create |
| `NOT_FOUND` | 404 | Generic resource not found |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled server error |

---

## 17. SSE Event Reference

All SSE events follow this shape:
```
event: <event_name>
data: <JSON string>
```

### `approval_updated`
Fired when a faculty approves or marks due.
```json
{
  "requestId": "6627a3f2e4b0c9d8f0003001",
  "studentId": "6627a3f2e4b0c9d8f9999999",
  "rollNo": "21CSE001",
  "batchId": "6627a3f2e4b0c9d8f0002001",
  "facultyId": "6627a3f2e4b0c9d8f1234567",
  "action": "approved | due_marked",
  "overallStatus": "pending | cleared | has_dues"
}
```
**Who receives it:** `admin:{id}`, `hod:{id}` (same dept), `student:{studentId}`

---

### `batch_initiated`
Fired when a new batch is created.
```json
{
  "batchId": "6627a3f2e4b0c9d8f0002001",
  "classId": "6627a3f2e4b0c9d8f0000010",
  "className": "CSE-A Sem 5",
  "departmentId": "6627a3f2e4b0c9d8f0000001",
  "totalStudents": 65
}
```
**Who receives it:** `admin:{id}`, `hod:{id}` (same dept)

---

### `batch_closed`
Fired when a batch is manually closed.
```json
{
  "batchId": "6627a3f2e4b0c9d8f0002001",
  "classId": "6627a3f2e4b0c9d8f0000010",
  "className": "CSE-A Sem 5"
}
```
**Who receives it:** `admin:{id}`, `hod:{id}`, all faculty in that class, all students in that class

---

### `override_applied`
Fired when HoD overrides a blocked clearance.
```json
{
  "requestId": "6627a3f2e4b0c9d8f0003002",
  "studentId": "6627a3f2e4b0c9d8f9999998",
  "rollNo": "21CSE002",
  "overriddenBy": "Dr. Mehta",
  "overallStatus": "hod_override"
}
```
**Who receives it:** `admin:{id}`, `hod:{id}`, `student:{studentId}`

---

### `student_added`
Fired when a late student is manually added to an active batch.
```json
{
  "batchId": "6627a3f2e4b0c9d8f0002001",
  "studentId": "6627a3f2e4b0c9d8f9999100",
  "rollNo": "21CSE066",
  "name": "Arjun Nair"
}
```
**Who receives it:** `admin:{id}`, `hod:{id}`

---

## 18. Frontend Usage Notes

### Axios Setup
```javascript
// src/api/axiosInstance.js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,   // ← critical: sends httpOnly cookie automatically
})

// Global error interceptor
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const code = err.response?.data?.error?.code
    if (code === 'AUTH_PASSWORD_CHANGE_REQUIRED') {
      window.location.href = '/change-password'
    }
    if (code === 'AUTH_UNAUTHORIZED') {
      window.location.href = '/login'
    }
    return Promise.reject(err.response?.data?.error)
  }
)

export default api
```

---

### SSE Hook
```javascript
// src/hooks/useSSE.js
import { useEffect } from 'react'

export function useSSE({ onApprovalUpdated, onOverrideApplied, onBatchInitiated, onBatchClosed }) {
  useEffect(() => {
    const es = new EventSource(
      `${import.meta.env.VITE_API_URL}/sse/connect`,
      { withCredentials: true }
    )

    es.addEventListener('approval_updated', (e) => {
      onApprovalUpdated?.(JSON.parse(e.data))
    })
    es.addEventListener('override_applied', (e) => {
      onOverrideApplied?.(JSON.parse(e.data))
    })
    es.addEventListener('batch_initiated', (e) => {
      onBatchInitiated?.(JSON.parse(e.data))
    })
    es.addEventListener('batch_closed', (e) => {
      onBatchClosed?.(JSON.parse(e.data))
    })

    return () => es.close()
  }, [])
}
```

---

### File Download (Import Template)
```javascript
// Trigger Excel template download
const downloadTemplate = (type) => {
  window.open(`${import.meta.env.VITE_API_URL}/import/template/${type}`, '_blank')
}
```

---

### File Upload (Import Preview)
```javascript
const previewImport = async (file, classId) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/import/students/preview?classId=${classId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
```

---

### Status → Display Mapping
```javascript
// src/utils/statusColors.js
export const STATUS_CONFIG = {
  pending:      { label: '⏳ Pending',     color: 'amber',  bg: 'bg-amber-100',  text: 'text-amber-800'  },
  approved:     { label: '✅ Approved',    color: 'green',  bg: 'bg-green-100',  text: 'text-green-800'  },
  due_marked:   { label: '❌ Due Marked',  color: 'red',    bg: 'bg-red-100',    text: 'text-red-800'    },
  cleared:      { label: '🟢 Cleared',    color: 'green',  bg: 'bg-green-100',  text: 'text-green-800'  },
  has_dues:     { label: '🔴 Has Dues',   color: 'red',    bg: 'bg-red-100',    text: 'text-red-800'    },
  hod_override: { label: '🔷 HoD Cleared', color: 'blue',  bg: 'bg-blue-100',   text: 'text-blue-800'   },
}

export const APPROVAL_TYPE_LABEL = {
  subject:     (subjectName) => subjectName,
  classTeacher: () => 'Class Teacher',
  mentor:       () => 'Mentor',
}

export const DUE_TYPE_LABEL = {
  library:    'Library',
  lab:        'Lab',
  fees:       'Fees',
  attendance: 'Attendance',
  other:      'Other',
}
```

---

### Post-Login Role Redirect
```javascript
// src/utils/roleRedirect.js
export const getRoleRedirect = (role, roleTags) => {
  if (role === 'student') return '/student/status'
  if (role === 'admin')   return '/admin/dashboard'
  if (roleTags?.includes('hod')) return '/hod/dashboard'
  return '/faculty/dashboard'
}
```

---

### Environment Variables
```
# .env (frontend)
VITE_API_URL=http://localhost:5000/api

# .env.production
VITE_API_URL=https://nds-backend.onrender.com/api
```

---

## 19. Backend Implementation Notes

### Express App Setup
```
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(cookieParser())
app.use(express.json())

app.use('/api/auth',     authRouter)
app.use('/api/departments', authenticate, departmentRouter)
app.use('/api/subjects', authenticate, subjectRouter)
app.use('/api/classes',  authenticate, classRouter)
app.use('/api/faculty',  authenticate, facultyRouter)
app.use('/api/students', authenticate, studentRouter)
app.use('/api/import',   authenticate, importRouter)
app.use('/api/batch',    authenticate, batchRouter)
app.use('/api/approvals',authenticate, approvalRouter)
app.use('/api/hod',      authenticate, roleGuard('hod'), hodRouter)
app.use('/api/student',  authenticate, roleGuard('student'), studentPortalRouter)
app.use('/api/sse',      authenticate, sseRouter)

app.use(errorHandler)
```

### Department Scope Middleware
```javascript
// middleware/deptScope.js
// Automatically applied to all HoD routes
// Injects departmentId filter into req so all queries are scoped
export const deptScope = (req, res, next) => {
  if (req.user.role === 'hod') {
    req.deptFilter = { departmentId: req.user.departmentId }
  } else {
    req.deptFilter = {}   // admin sees everything
  }
  next()
}
// Usage in route: Model.find({ ...req.deptFilter, ...otherFilters })
```

### Caching Pattern
```javascript
// On read: check cache first
const cacheKey = `student_status:${studentId}`
const cached = cache.get(cacheKey)
if (cached) return res.json({ success: true, data: cached })

// Fetch from DB, set cache
const data = await buildStudentStatus(studentId)
cache.set(cacheKey, data, 30)   // TTL: 30s
return res.json({ success: true, data })

// On write: invalidate precisely
cache.del(`student_status:${studentId}`)
cache.del(`batch_status:${batchId}`)
cache.del(`faculty_pending:${facultyId}`)
```

### SSE Push Pattern
```javascript
// After any approval action:
sseService.push(`student:${studentId}`, 'approval_updated', {
  requestId, studentId, rollNo, batchId, facultyId, action, overallStatus
})
sseService.push(`admin:${adminId}`, 'approval_updated', { ... })
// Push to all admins:
sseService.broadcastToRole('admin', 'approval_updated', { ... })
```

### bulkWrite Pattern for Batch Initiation
```javascript
const ops = []
// 1 batch
ops.push({ insertOne: { document: batchDoc } })
// N requests + N*M approvals
for (const student of students) {
  const snapshot = buildFacultySnapshot(classDoc, student)
  const requestId = new mongoose.Types.ObjectId()
  ops.push({ insertOne: { document: { _id: requestId, batchId, studentId: student._id, ...snapshot, status: 'pending' } } })
  for (const entry of snapshot.facultySnapshot) {
    ops.push({ insertOne: { document: { requestId, batchId, facultyId: entry.facultyId, subjectId: entry.subjectId, approvalType: entry.approvalType, roleTag: entry.roleTag, action: 'pending', ... } } })
  }
}
await mongoose.connection.db.collection('operations').bulkWrite(ops, { ordered: false })
```

---

*End of API Design Guide v1.0 — No-Due Clearance System, MITS*  
*Both frontend and backend must reference this document. Any endpoint change requires updating this guide first.*
