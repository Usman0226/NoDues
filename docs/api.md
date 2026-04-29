# No-Due Clearance System API Documentation

## Rate Limiting

The API implements rate limiting to ensure stability and security. Different tiers of rate limiting are applied based on the sensitivity and resource intensity of the endpoints.

### Global API Limit
- **Scope**: All `/api/*` endpoints (unless overridden by a stricter tier).
- **Limit**: 500 requests per 15 minutes per IP.
- **Headers**: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.
- **Response**: 429 Too Many Requests.

### Authentication Tier
- **Scope**: `/api/auth/login`, `/api/auth/student-login`.
- **Limit**: 10 attempts per 15 minutes per IP.
- **Response**: 429 Too Many Requests with code `AUTH_RATE_LIMIT_EXCEEDED`.

### Import Tier
- **Scope**: All `/api/import/*` endpoints.
- **Limit**: 30 requests per hour per IP.
- **Response**: 429 Too Many Requests with code `IMPORT_RATE_LIMIT_EXCEEDED`.

### Health Check Tier
- **Scope**: `/api/health`.
- **Limit**: 60 requests per minute per IP.

---

## Administrative Endpoints

### POST /api/import/students/commit
Description: Commit validated student rows to DB in bulk.

curl -X POST http://localhost:5000/api/import/students/commit \
  -H "Content-Type: application/json" \
  -d '{
    "classId": "6627a3f2e4b0c9d8f0000010",
    "students": [
      { "rollNo": "21CSE001", "name": "Riya Sharma", "email": "riya@example.com" }
    ]
  }'

Sample Response (201):
{
  "success": true,
  "data": { "message": "Successfully imported 1 students" }
}

Error Codes: 400 (validation), 401 (auth), 404 (class not found)

---

### POST /api/import/faculty/commit
Description: Commit validated faculty rows to DB in bulk.

curl -X POST http://localhost:5000/api/import/faculty/commit \
  -H "Content-Type: application/json" \
  -d '{
    "faculty": [
      { "employeeId": "EMP042", "name": "Dr. Sharma", "email": "dr.sharma@mits.ac.in", "departmentName": "CSE" }
    ]
  }'

Sample Response (201):
{
  "success": true,
  "data": { "message": "Successfully imported 1 faculty members" }
}

Error Codes: 400 (validation), 401 (auth)

---

### POST /api/import/electives/commit
Description: Commit batch elective assignments.

curl -X POST http://localhost:5000/api/import/electives/commit \
  -H "Content-Type: application/json" \
  -d '{
    "electives": [
      { 
        "studentId": "6627a3f2e4b0c9d8f9999999", 
        "subjectId": "6627a3f2e4b0c9d8f0001010",
        "subjectName": "Machine Learning",
        "subjectCode": "CS601E",
        "facultyId": "6627a3f2e4b0c9d8f1234567",
        "facultyName": "Dr. Mehta"
      }
    ]
  }'

Sample Response (200):
{
  "success": true,
  "data": { "message": "Successfully updated 1 elective assignments" }
}

Error Codes: 400 (validation), 401 (auth)

---

### POST /api/import/mentors/commit
Description: Commit batch mentor assignments.

curl -X POST http://localhost:5000/api/import/mentors/commit \
  -H "Content-Type: application/json" \
  -d '{
    "mentors": [
      { "studentId": "6627a3f2e4b0c9d8f9999999", "mentorId": "6627a3f2e4b0c9d8f1234567" }
    ]
  }'

Sample Response (200):
{
  "success": true,
  "data": { "message": "Successfully updated 1 mentor assignments" }
}

Error Codes: 400 (validation), 401 (auth)

---

### POST /api/faculty
Description: Create a single faculty account.

curl -X POST http://localhost:5000/api/faculty \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Prof. John",
    "email": "john@mits.ac.in",
    "employeeId": "EMP123",
    "departmentId": "6627a3f2e4b0c9d8f0000001",
    "roleTags": ["faculty"]
  }'

Sample Response (201):
{
  "success": true,
  "data": { "_id": "6627a3f2e4b0c9d8f1234abc", "name": "Prof. John", "email": "john@mits.ac.in" }
}

Error Codes: 400 (validation), 401 (auth), 403 (access denied), 404 (dept not found)

---

### PATCH /api/faculty/:id
Description: Update faculty information.

curl -X PATCH http://localhost:5000/api/faculty/6627a3f2e4b0c9d8f1234abc \
  -H "Content-Type: application/json" \
  -d '{ "name": "Prof. John Doe" }'

Sample Response (200):
{
  "success": true,
  "data": { "_id": "6627a3f2e4b0c9d8f1234abc", "name": "Prof. John Doe" }
}

Error Codes: 401 (auth), 403 (access denied), 404 (not found)

---

Error Codes: 401 (auth), 403 (access denied), 404 (not found)

---

### PATCH /api/faculty/bulk-deactivate
Description: Soft delete / deactivate multiple faculty accounts.

curl -X PATCH http://localhost:5000/api/faculty/bulk-deactivate \
  -H "Content-Type: application/json" \
  -d '{ "employeeIds": ["EMP123", "EMP124"] }'

Sample Response (200):
{ "success": true, "data": { "message": "2 faculty accounts deactivated" } }

---

### POST /api/faculty/bulk-resend-credentials
Description: Resend login credentials to multiple faculty accounts.

curl -X POST http://localhost:5000/api/faculty/bulk-resend-credentials \
  -H "Content-Type: application/json" \
  -d '{ "employeeIds": ["EMP123", "EMP124"] }'

Sample Response (200):
{ "success": true, "data": { "message": "Credentials resent to 2 accounts" } }

---

### POST /api/students
Description: Create a single student account manually.

curl -X POST http://localhost:5000/api/students \
  -H "Content-Type: application/json" \
  -d '{
    "rollNo": "21CSE099",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "classId": "6627a3f2e4b0c9d8f0000010"
  }'

Sample Response (201):
{
  "success": true,
  "data": { "_id": "6627a3f2e4b0c9d8f9999abc", "rollNo": "21CSE099", "name": "Jane Doe" }
}

Error Codes: 400 (validation), 401 (auth), 403 (access denied), 404 (class not found)

---

### PATCH /api/students/:id
Description: Update student details.

curl -X PATCH http://localhost:5000/api/students/6627a3f2e4b0c9d8f9999abc \
  -H "Content-Type: application/json" \
  -d '{ "name": "Jane D. Doe" }'

Sample Response (200):
{
  "success": true,
  "data": { "_id": "6627a3f2e4b0c9d8f9999abc", "name": "Jane D. Doe" }
}

Error Codes: 401 (auth), 403 (access denied), 404 (not found)

---

Error Codes: 401 (auth), 403 (access denied), 404 (not found)

---

### PATCH /api/students/bulk-deactivate
Description: Soft delete / deactivate multiple student accounts.

curl -X PATCH http://localhost:5000/api/students/bulk-deactivate \
  -H "Content-Type: application/json" \
  -d '{ "studentIds": ["6627a3f2e4b0c9d8f9999abc", "6627a3f2e4b0c9d8f9999abd"] }'

Sample Response (200):
{ "success": true, "data": { "message": "2 student accounts deactivated" } }

---

### PATCH /api/students/bulk-assign-mentor
Description: Assign a faculty mentor to multiple students.

curl -X PATCH http://localhost:5000/api/students/bulk-assign-mentor \
  -H "Content-Type: application/json" \
  -d '{ "studentIds": ["6627a3f2e4b0c9d8f9999abc"], "mentorId": "6627a3f2e4b0c9d8f1234567" }'

Sample Response (200):
{ "success": true, "data": { "message": "Mentor assigned to 1 students" } }

---

### PATCH /api/students/:id/mentor
Description: Assign a faculty mentor to a specific student.

curl -X PATCH http://localhost:5000/api/students/6627a3f2e4b0c9d8f9999abc/mentor \
  -H "Content-Type: application/json" \
  -d '{ "mentorId": "6627a3f2e4b0c9d8f1234567" }'

Sample Response (200):
{
  "success": true,
  "data": { "message": "Mentor assigned successfully" }
}

Error Codes: 401 (auth), 404 (student/mentor not found)

---

### POST /api/students/:id/electives
Description: Add an elective subject mapping to a student.

curl -X POST http://localhost:5000/api/students/6627a3f2e4b0c9d8f9999abc/electives \
  -H "Content-Type: application/json" \
  -d '{ "subjectId": "6627a3f2e4b0c9d8f0001010", "facultyId": "6627a3f2e4b0c9d8f1234567" }'

Sample Response (201):
{
  "success": true,
  "data": { "message": "Elective added successfully" }
}

Error Codes: 400 (duplicate), 401 (auth), 404 (student/subject not found)

---

### DELETE /api/students/:id/electives/:assignmentId
Description: Remove an elective subject mapping from a student.

curl -X DELETE http://localhost:5000/api/students/6627a3f2e4b0c9d8f9999abc/electives/6627a3f2e4b0c9d8fcccc123

Sample Response (200):
{
  "success": true,
  "data": { "message": "Elective removed successfully" }
}

Error Codes: 401 (auth), 404 (not found)

---

### POST /api/departments
Description: Create a new department.

curl -X POST http://localhost:5000/api/departments \
  -H "Content-Type: application/json" \
  -d '{ "name": "AI & ML", "hodId": "6627a3f2e4b0c9d8f1234567" }'

Sample Response (201):
{
  "success": true,
  "data": { "_id": "6627a3f2e4b0c9d8f0000abc", "name": "AI & ML" }
}

Error Codes: 400 (validation), 401 (auth), 404 (HoD faculty not found)

---

### PATCH /api/departments/:id
Description: Update department information.

curl -X PATCH http://localhost:5000/api/departments/6627a3f2e4b0c9d8f0000abc \
  -H "Content-Type: application/json" \
  -d '{ "name": "AIML" }'

Sample Response (200):
{
  "success": true,
  "data": { "_id": "6627a3f2e4b0c9d8f0000abc", "name": "AIML" }
}

Error Codes: 401 (auth), 404 (not found)

---

### POST /api/classes
Description: Create a new class.

curl -X POST http://localhost:5000/api/classes \
  -H "Content-Type: application/json" \
  -d '{ "name": "CSE-A Sem 5", "departmentId": "6627a3f2e4b0cc9d8f0000001", "semester": 5, "academicYear": "2025-26", "classTeacherId": "6627a3f2e4b0c9d8f1234568" }'

Sample Response (201):
{
  "success": true,
  "data": { "_id": "6627a3f2e4b0c9d8f0000010", "name": "CSE-A Sem 5" }
}

Error Codes: 400 (validation), 401 (auth), 403 (access denied)

---

### POST /api/batch/initiate
Description: Initiate a no-due batch for a class.

curl -X POST http://localhost:5000/api/batch/initiate \
  -H "Content-Type: application/json" \
  -d '{ "classId": "6627a3f2e4b0c9d8f0000010" }'

Sample Response (201):
{
  "success": true,
  "data": { "batchId": "6627a3f2e4b0c9d8f0000b01", "message": "Batch initiated successfully" }
}

Error Codes: 400 (validation), 401 (auth), 409 (active batch already exists)

---

Error Codes: 401 (auth), 404 (not found)

---

### PATCH /api/batch/bulk-close
Description: Manually close multiple active batches.

curl -X PATCH http://localhost:5000/api/batch/bulk-close \
  -H "Content-Type: application/json" \
  -d '{ "batchIds": ["6627a3f2e4b0c9d8f0000b01", "6627a3f2e4b0c9d8f0000b02"] }'

Sample Response (200):
{ "success": true, "data": { "message": "2 batches closed" } }

---

Error Codes: 400 (validation), 401 (auth)

---

### POST /api/hod/bulk-override
Description: HoD bulk override for student dues.

curl -X POST http://localhost:5000/api/hod/bulk-override \
  -H "Content-Type: application/json" \
  -d '{ "studentIds": ["6627a3f2e4b0c9d8f9999abc"], "remark": "Fee waiver approved" }'

Sample Response (200):
{ "success": true, "data": { "message": "Dues overridden for 1 students" } }

---

### PATCH /api/subject/bulk-deactivate
Description: Soft delete / deactivate multiple subjects.

curl -X PATCH http://localhost:5000/api/subject/bulk-deactivate \
  -H "Content-Type: application/json" \
  -d '{ "subjectCodes": ["CS101", "CS102"] }'

Sample Response (200):
{ "success": true, "data": { "message": "2 subjects deactivated" } }

---

## Notification Endpoints

### GET /api/notifications
Description: Fetch current user's notifications (last 200).

curl -X GET http://localhost:5000/api/notifications \
  -H "Authorization: Bearer <token>"

Sample Response (200):
{
  "success": true,
  "data": [
    {
      "_id": "6627a3f2e4b0c9d8f0000001",
      "title": "Batch Initiated",
      "message": "Batch for CSE-A has been started.",
      "read": false,
      "type": "info",
      "createdAt": "2026-04-20T18:00:00Z"
    }
  ]
}

---

### PATCH /api/notifications/read
Description: Mark all or specific notifications as read.

curl -X PATCH http://localhost:5000/api/notifications/read \
  -H "Authorization: Bearer <token>" \
  -d '{ "id": "6627a3f2e4b0c9d8f0000001" }' (optional)

Sample Response (200):
{ "success": true, "data": { "message": "Notifications updated" } }

---

### DELETE /api/notifications
Description: Clear all read notifications or a specific notification.

curl -X DELETE http://localhost:5000/api/notifications \
  -H "Authorization: Bearer <token>" \
  -d '{ "id": "6627a3f2e4b0c9d8f0000001" }' (optional)

Sample Response (200):
{ "success": true, "data": { "message": "Notifications cleared" } }

---

## Feedback Endpoints

### POST /api/feedback
Description: Submit feedback, bug reports, or suggestions.

curl -X POST http://localhost:5000/api/feedback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "type": "bug",
    "description": "The table alignment is slightly off on mobile devices.",
    "page": "/faculty/pending",
    "userAgent": "Mozilla/5.0..."
  }'

Sample Response (201):
{
  "success": true,
  "data": {
    "_id": "6627a3f2e4b0c9d8f9999000",
    "type": "bug",
    "description": "The table alignment is slightly off on mobile devices.",
    "status": "open"
  }
}

Error Codes: 400 (validation), 401 (auth)

---

## Co-Curricular Management

### POST /api/cocurricular
Description: Create a new co-curricular clearance template.

curl -X POST http://localhost:5000/api/cocurricular \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Library Clearance",
    "code": "LIB001",
    "departmentId": "6627a3f2e4b0c9d8f0000001",
    "coordinatorId": "6627a3f2e4b0c9d8f1234567",
    "requiresMentorApproval": false,
    "requiresClassTeacherApproval": true,
    "fields": [
      { "label": "Books Returned", "type": "boolean", "required": true }
    ]
  }'

Sample Response (201):
{ "success": true, "data": { "_id": "6627a3f2e4b0c9d8f0000abc", "name": "Library Clearance" } }

---

### POST /api/cocurricular/assign
Description: Manually trigger assignment of co-curricular clearance to students.

curl -X POST http://localhost:5000/api/cocurricular/assign \
  -H "Content-Type: application/json" \
  -d '{
    "cocurricularId": "6627a3f2e4b0c9d8f0000abc",
    "mode": "per_class_teacher"
  }'

Modes: `single` (uses default coordinator), `per_mentor` (uses student's mentor), `per_class_teacher` (uses student's class teacher)

Sample Response (200):
{ "success": true, "data": { "message": "Assignment task initiated for 120 students" } }
