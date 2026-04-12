# No-Due Clearance System API Documentation

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

### DELETE /api/faculty/:id
Description: Soft delete / deactivate faculty account.

curl -X DELETE http://localhost:5000/api/faculty/6627a3f2e4b0c9d8f1234abc

Sample Response (200):
{
  "success": true,
  "data": { "message": "Faculty account deactivated" }
}

Error Codes: 401 (auth), 403 (access denied), 404 (not found)

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

### DELETE /api/students/:id
Description: Soft delete / deactivate student account.

curl -X DELETE http://localhost:5000/api/students/6627a3f2e4b0c9d8f9999abc

Sample Response (200):
{
  "success": true,
  "data": { "message": "Student account deactivated" }
}

Error Codes: 401 (auth), 403 (access denied), 404 (not found)

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

### PATCH /api/batch/:batchId/close
Description: Manually close an active batch.

curl -X PATCH http://localhost:5000/api/batch/6627a3f2e4b0c9d8f0000b01/close

Sample Response (200):
{
  "success": true,
  "data": { "message": "Batch closed successfully" }
}

Error Codes: 401 (auth), 404 (not found)

---

### POST /api/approvals/bulk-approve
Description: Approve multiple clearance requests at once.

curl -X POST http://localhost:5000/api/approvals/bulk-approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "approvalIds": ["6627a3f2e4b0cc9d8f0000a1", "6627a3f2e4b0cc9d8f0000a2"]
  }'

Sample Response (200):
{
  "success": true,
  "data": {
    "count": 2,
    "results": [
      { "id": "6627a3f2e4b0cc9d8f0000a1", "status": "approved" },
      { "id": "6627a3f2e4b0cc9d8f0000a2", "status": "approved" }
    ]
  }
}

Error Codes: 400 (validation), 401 (auth)

