# NoDues API Documentation

## Base URL
`https://api.nodues.mits.edu/api/v1` (Production)
`http://localhost:5000/api` (Local Development)

---

### GET /api/health
Description: Health check endpoint to verify server status.

```bash
curl -X GET http://localhost:5000/api/health
```

Sample Response (200):
```json
{
  "status": "success",
  "message": "Server is healthy",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

Error Codes: 500 (server)

---

### POST /api/auth/login
Description: Unified login for Admin and Faculty.

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@mits.edu",
    "password": "password123"
  }'
```

Sample Response (200):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1...",
  "user": {
    "id": "60d0fe...",
    "role": "faculty",
    "roleTags": ["faculty", "mentor"]
  }
}
```

Error Codes: 401 (invalid credentials), 403 (password change required)
