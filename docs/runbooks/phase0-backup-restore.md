# Phase 0 Runbook: Manual Production Backup, Restore & Staging Clone
**TRD References:** TRD §5 Phase 0 (Steps 0.1, 0.2, 0.3) | Constraints: NC-1, NC-2, NC-3

---

## Objective
Provide exact, copy-pasteable operational steps for the administrator to:
1. Take a verified, timestamped manual backup snapshot of the live production MongoDB cluster (TRD 0.1).
2. Restore that snapshot into a dedicated, isolated test cluster/database (TRD 0.2).
3. Verify that all collection document counts match 100% between production and the restored copy using `scripts/verify-counts.js`.
4. Clone production data into a persistent staging cluster that will serve as the rehearsal environment for all subsequent migration phases (TRD 0.3).

> [!CAUTION]
> **Safety First (NC-1, NC-2):**
> * NEVER commit credentials or connection strings to git.
> * NEVER store database dumps or archives inside the repository directory.
> * NEVER run migration scripts against production without completing this verification.
> * All Atlas cluster management actions in this runbook are performed manually by the administrator.

---

## Pre-Requisites & Required CLI Tools
Ensure the following tools are available on your administrative machine:
* `mongodump` and `mongorestore` (MongoDB Database Tools: `mongosh --version` / `mongodump --version`)
* Node.js (v20+ or v22+)
* Access to the MongoDB Atlas Console with Project Owner / Cluster Admin privileges.

Set your environment variables in a private shell session (do **NOT** persist them in tracked files):
```bash
# In an ephemeral terminal session:
export PROD_MONGO_URI="mongodb+srv://<USER>:<PASS>@<PROD_HOST>/<PROD_DB>?retryWrites=true&w=majority"
export TEST_MONGO_URI="mongodb+srv://<USER>:<PASS>@<TEST_HOST>/<TEST_DB>?retryWrites=true&w=majority"
export STAGING_MONGO_URI="mongodb+srv://<USER>:<PASS>@<STAGING_HOST>/<STAGING_DB>?retryWrites=true&w=majority"
```

---

## Step 0.1: Manual Production Backup Snapshot (TRD Step 0.1)

### Option A: MongoDB Atlas Cloud Backup (Recommended)
1. Log in to [MongoDB Atlas Console](https://cloud.mongodb.com/).
2. Select the Project and click on the **Production Cluster** (e.g., `Cluster0`).
3. Click the **Backup** tab in the top navigation.
4. Under **Cloud Backup**, click **Take On-Demand Snapshot**.
5. Set retention policy:
   * **Retention:** 7 days (or maximum available).
   * **Description:** `phase0-pre-migration-backup-<YYYY-MM-DD-HHMM>` (e.g. `phase0-pre-migration-backup-2026-11-10`).
6. Click **Take Snapshot**.
7. Wait until the snapshot status changes from `In Progress` to `Completed`.
8. Document the Snapshot ID, timestamp, and size in `docs/phase0-progress.md`.

### Option B: Local mongodump Archive Fallback
Run a direct, compressed BSON dump to an isolated directory outside the repository:
```bash
# Create an external backup directory
mkdir -p ~/nodues-backups/$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=~/nodues-backups/$(date +%Y%m%d_%H%M%S)

# Execute mongodump with gzip compression and metadata
mongodump --uri="$PROD_MONGO_URI" --gzip --archive="${BACKUP_DIR}/nodues_prod_backup.gz"

# Verify archive existence and file size
ls -lh "${BACKUP_DIR}/nodues_prod_backup.gz"
```

---

## Step 0.2: Restore Snapshot into Separate Test Cluster (TRD Step 0.2)

### Target Cluster Rules
* The test cluster must be an **isolated** instance (e.g. Atlas M0 Free Tier or local Docker container `mongo:7`).
* The target database name **MUST** start with `test_` (e.g., `test_nodues_restore`).

### Option A: Restore from Atlas Snapshot UI
1. In MongoDB Atlas > **Backup** tab, locate the snapshot created in Step 0.1.
2. Click **...** (Actions) on the snapshot row and select **Restore**.
3. Choose **Restore to another cluster**.
4. Select the **Test Cluster** from the dropdown.
5. Provide the target database name: `test_nodues_verification`.
6. Confirm and initiate the restore. Wait for completion notification.

### Option B: Restore via `mongorestore`
```bash
# Restore from archive into target test database with --drop to ensure clean state
mongorestore --uri="$TEST_MONGO_URI" \
  --gzip \
  --archive="${BACKUP_DIR}/nodues_prod_backup.gz" \
  --nsInclude="<PROD_DB>.*" \
  --nsFrom="<PROD_DB>.*" \
  --nsTo="test_nodues_restore.*" \
  --drop
```

---

## Verification: Record Counts Comparison (TRD Step 0.2 Criterion)

Run `scripts/verify-counts.js` against both clusters to guarantee zero document loss or corruption:

```bash
# 1. Output production collection counts
node scripts/verify-counts.js "$PROD_MONGO_URI" > /tmp/prod_counts.json

# 2. Output restored test collection counts
node scripts/verify-counts.js "$TEST_MONGO_URI" > /tmp/test_counts.json

# 3. Compare with diff
diff -u /tmp/prod_counts.json /tmp/test_counts.json
```

### Acceptance Criterion
* The `diff` must produce **zero differences** across all collections:
  * `admins`
  * `classes`
  * `cocurriculartypes`
  * `departments`
  * `faculties`
  * `nodueapprovals`
  * `noduebatches`
  * `noduerequests`
  * `notifications`
  * `students`
  * `subjects`
* If any collection count differs, stop immediately. Do not proceed.

---

## Step 0.3: Clone Production Data into Staging Cluster (TRD Step 0.3)

A persistent staging cluster is required for rehearsal of Phase 2 (batch inference) and Phase 3 (class consolidation) migrations.

1. In MongoDB Atlas, create or select a dedicated cluster: `nodues-staging`.
2. Configure Network Access: Whitelist your IP and staging deployment hosts.
3. Configure Database Access: Create a dedicated user (e.g., `nodues_staging_user`) with `readWrite` role scoped to `nodues_staging`.
4. Restore the production snapshot into the staging cluster:
   ```bash
   mongorestore --uri="$STAGING_MONGO_URI" \
     --gzip \
     --archive="${BACKUP_DIR}/nodues_prod_backup.gz" \
     --nsInclude="<PROD_DB>.*" \
     --nsFrom="<PROD_DB>.*" \
     --nsTo="nodues_staging.*" \
     --drop
   ```
5. Verify staging counts against production counts:
   ```bash
   node scripts/verify-counts.js "$STAGING_MONGO_URI" > /tmp/staging_counts.json
   diff -u /tmp/prod_counts.json /tmp/staging_counts.json
   ```
6. Ensure `ENABLE_STUDENT_EMAILS=false` and all outbound side effects are disabled on any server instance pointing to this staging cluster.

---

## Phase 0.1 - 0.3 Sign-Off Checklist

Before proceeding to Step 0.4 (Regression Suite):
- [ ] Manual snapshot taken and documented in `docs/phase0-progress.md`.
- [ ] Snapshot successfully restored to test cluster (`test_*`).
- [ ] Per-collection counts match 100% between production and test copy.
- [ ] Staging cluster cloned and populated with production data.
- [ ] Staging counts match 100% of production counts.
- [ ] Staging cluster verified to have all email/outbound integrations disabled.
