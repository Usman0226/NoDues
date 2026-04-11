# No-Due Clearance System API Documentation

## Import Endpoints

### POST /api/import/preview/:type
Description: Previews the data from an Excel/CSV file before committing it to the database. Validates fields and checks for duplicates.
Types Supported: `student`, `faculty`, `elective`, `mentor`

```bash
curl -X POST http://localhost:5000/api/import/preview/student \
  -H "Authorization: Bearer <token>" \
  -F "file=@students.xlsx"
```

Sample Response (200):
{
  "success": true,
  "data": {
    "summary": { "total": 100, "valid": 95, "invalid": 5 },
    "rows": [ ... ],
    "canCommit": true
  }
}

Error Codes: 400 (Validation), 401 (Auth), 403 (Forbidden), 413 (Payload too large)

---

### POST /api/import/commit/:type
Description: Commits the validated data from an Excel/CSV file to the database. For students and faculty, it also triggers credential emails.

```bash
curl -X POST http://localhost:5000/api/import/commit/student \
  -H "Authorization: Bearer <token>" \
  -F "file=@students.xlsx"
```

Sample Response (200):
{
  "success": true,
  "data": {
    "importedCount": 100,
    "message": "Bulk import completed successfully"
  }
}

---

### GET /api/import/template/:type
Description: Downloads an Excel template for the specified import type.

```bash
curl -X GET http://localhost:5000/api/import/template/student \
  -H "Authorization: Bearer <token>"
```

---

## SSE Endpoints

### GET /api/sse/events
Description: Establishes a Server-Sent Events connection for real-time notifications.
Query Params: `token` (JWT)

```bash
# Handled by browser EventSource
const eventSource = new EventSource('/api/sse/events?token=' + token);
```

---

## Approval Endpoints (SSE Integrated)

### POST /api/approvals/approve
### POST /api/approvals/mark-due
### PATCH /api/approvals/:approvalId

*Note: These endpoints now broadcast real-time updates to relevant students via SSE.*
