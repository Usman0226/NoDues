# Phase 0 Runbook: M0 Free-Tier Production Backup, Restore & Staging Clone
**TRD References:** TRD §5 Phase 0 (Steps 0.1, 0.2, 0.3) | Constraints: NC-1, NC-2, NC-3

---

## 1. Objective & Architecture Reality
Provide exact, copy-pasteable operational steps for the administrator to:
1. Take a verified, timestamped manual backup of the live production MongoDB cluster (TRD 0.1).
2. Restore that backup into a dedicated, isolated test database (`test_*`) (TRD 0.2).
3. Verify that all collection document counts match 100% between production and the restored copy using `scripts/verify-counts.js`.
4. Clone production data into a persistent staging cluster that will serve as the rehearsal environment for all subsequent migration phases (TRD 0.3).

> [!IMPORTANT]
> **MongoDB Atlas M0 Free Tier Constraints:**
> Atlas M0 (Free Tier) and M2/M5 Shared clusters **do not support Atlas Cloud Backup or automated/on-demand UI snapshots**.
> All backup, restore, and cloning operations on M0 clusters must be performed client-side using the official MongoDB Database Tools (`mongodump` and `mongorestore`) with compressed BSON archives (`--archive --gzip`).

> [!CAUTION]
> **Safety First (NC-1, NC-2):**
> * NEVER commit credentials or connection strings to git.
> * NEVER store database dumps or archives inside the repository directory. Store them in `$HOME/nodues-backups/` outside git tracking.
> * NEVER push anything to GitHub — pushing is strictly reserved for the repository owner.
> * All Atlas cluster management actions in this runbook are performed manually by the administrator.

---

## 2. Pre-Requisites & Required CLI Tools

Ensure MongoDB Database Tools are installed on your administrative machine:
- Verify tools: `mongodump --version` and `mongorestore --version`
  *(If not installed, download from [MongoDB Database Tools Download Portal](https://www.mongodb.com/try/download/database-tools) or install via `winget install MongoDB.DatabaseTools` / `brew install mongodb-database-tools`)*
- Node.js (v20+ or v22+)

Set connection URIs in your private, ephemeral terminal session (do **NOT** persist them in tracked files):

### On Windows PowerShell:
```powershell
$env:PROD_MONGO_URI = "mongodb+srv://<USER>:<PASS>@<PROD_HOST>/<PROD_DB>?retryWrites=true&w=majority"
$env:TEST_MONGO_URI = "mongodb+srv://<USER>:<PASS>@<TEST_HOST>/test_nodues_restore?retryWrites=true&w=majority"
$env:STAGING_MONGO_URI = "mongodb+srv://<USER>:<PASS>@<STAGING_HOST>/nodues_staging?retryWrites=true&w=majority"
```

### On Bash / Linux / macOS:
```bash
export PROD_MONGO_URI="mongodb+srv://<USER>:<PASS>@<PROD_HOST>/<PROD_DB>?retryWrites=true&w=majority"
export TEST_MONGO_URI="mongodb+srv://<USER>:<PASS>@<TEST_HOST>/test_nodues_restore?retryWrites=true&w=majority"
export STAGING_MONGO_URI="mongodb+srv://<USER>:<PASS>@<STAGING_HOST>/nodues_staging?retryWrites=true&w=majority"
```

---

## 3. Step 0.1: Client-Side Compressed Production Backup (`mongodump`)

Run a direct, compressed BSON dump to an isolated directory outside the repository:

### Windows PowerShell:
```powershell
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "$HOME\nodues-backups\$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force

# Execute mongodump with gzip compression and single-file archive
mongodump --uri="$env:PROD_MONGO_URI" --gzip --archive="$backupDir\nodues_prod_backup.gz"

# Verify archive size (typically ~2MB - 10MB for 28k docs)
Get-Item "$backupDir\nodues_prod_backup.gz" | Select-Object Name, Length, LastWriteTime
```

### Bash / Linux / macOS:
```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/nodues-backups/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

# Execute mongodump with gzip compression and single-file archive
mongodump --uri="$PROD_MONGO_URI" --gzip --archive="$BACKUP_DIR/nodues_prod_backup.gz"

# Verify archive existence and file size
ls -lh "$BACKUP_DIR/nodues_prod_backup.gz"
```

Document the archive path, timestamp, and size in `docs/phase0-progress.md`.

---

## 4. Step 0.2: Restore Backup into Separate Test Database (`mongorestore`)

### Safety Gate
The target database name **MUST** start with `test_` (e.g., `test_nodues_restore`). The safety harness will refuse to interact with any database not matching `^test_`.

### Windows PowerShell:
```powershell
# Restore into test database with namespace remapping and --drop to ensure a clean state
mongorestore --uri="$env:TEST_MONGO_URI" `
  --gzip `
  --archive="$backupDir\nodues_prod_backup.gz" `
  --nsInclude="*.*" `
  --nsFrom="*.*" `
  --nsTo="test_nodues_restore.*" `
  --drop
```

### Bash / Linux / macOS:
```bash
mongorestore --uri="$TEST_MONGO_URI" \
  --gzip \
  --archive="$BACKUP_DIR/nodues_prod_backup.gz" \
  --nsInclude="*.*" \
  --nsFrom="*.*" \
  --nsTo="test_nodues_restore.*" \
  --drop
```

---

## 5. Verification: Record Counts Comparison (TRD Step 0.2 Criterion)

Run the read-only count verification script against both databases to confirm 100% zero data loss:

### Windows PowerShell:
```powershell
node scripts/verify-counts.js "$env:PROD_MONGO_URI" --json > "$backupDir\prod_counts.json"
node scripts/verify-counts.js "$env:TEST_MONGO_URI" --json > "$backupDir\test_counts.json"

# Compare outputs using git diff
git diff --no-index "$backupDir\prod_counts.json" "$backupDir\test_counts.json"
```

### Bash / Linux / macOS:
```bash
node scripts/verify-counts.js "$PROD_MONGO_URI" --json > "$BACKUP_DIR/prod_counts.json"
node scripts/verify-counts.js "$TEST_MONGO_URI" --json > "$BACKUP_DIR/test_counts.json"

# Compare outputs
diff -u "$BACKUP_DIR/prod_counts.json" "$BACKUP_DIR/test_counts.json"
```

### Acceptance Criterion
* The diff must produce **zero differences** across all 15 collections:
  * `admins`
  * `classes`
  * `cocurriculartypes`
  * `departments`
  * `emaillogs`
  * `emailquotas`
  * `faculties`
  * `feedbacks`
  * `nodueapprovals`
  * `noduebatches`
  * `noduerequests`
  * `notifications`
  * `students`
  * `subjects`
  * `tasks`
* If any collection count differs, halt immediately. Do not proceed to staging or Phase 1.

---

## 6. Step 0.3: Clone Production Data into Staging Database (TRD Step 0.3)

A persistent staging cluster/database (`nodues_staging`) is required for rehearsal of Phase 2 (batch inference) and Phase 3 (class consolidation) migrations.

### Windows PowerShell:
```powershell
mongorestore --uri="$env:STAGING_MONGO_URI" `
  --gzip `
  --archive="$backupDir\nodues_prod_backup.gz" `
  --nsInclude="*.*" `
  --nsFrom="*.*" `
  --nsTo="nodues_staging.*" `
  --drop

node scripts/verify-counts.js "$env:STAGING_MONGO_URI" --json > "$backupDir\staging_counts.json"
git diff --no-index "$backupDir\prod_counts.json" "$backupDir\staging_counts.json"
```

### Bash / Linux / macOS:
```bash
mongorestore --uri="$STAGING_MONGO_URI" \
  --gzip \
  --archive="$BACKUP_DIR/nodues_prod_backup.gz" \
  --nsInclude="*.*" \
  --nsFrom="*.*" \
  --nsTo="nodues_staging.*" \
  --drop

node scripts/verify-counts.js "$STAGING_MONGO_URI" --json > "$BACKUP_DIR/staging_counts.json"
diff -u "$BACKUP_DIR/prod_counts.json" "$BACKUP_DIR/staging_counts.json"
```

### Outbound Safeguard
Ensure that `ENABLE_STUDENT_EMAILS=false` and any email credentials (Resend/Brevo/SMTP) are disabled on any backend instance connecting to this staging environment so no live student or faculty member is contacted.

---

## 7. Phase 0.1 - 0.3 Sign-Off Checklist

Before proceeding to Phase 1:
- [ ] Client-side compressed backup taken via `mongodump` and stored safely outside git.
- [ ] Backup restored into test database (`test_nodues_restore`).
- [ ] Document counts verified with `scripts/verify-counts.js` showing 0 diff.
- [ ] Staging database populated via `mongorestore`.
- [ ] Staging document counts match production 100%.
- [ ] Outbound email delivery verified disabled on staging.
