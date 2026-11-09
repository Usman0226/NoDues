# Phase 0 Progress & Safety Tracking
**Project:** No-Due Clearance System (NDS)  
**TRD Target:** Phase 0 — Safety Infrastructure (Steps 0.1 – 0.4)  
**Branch:** `phase-0-safety-net`  
**Last Updated:** 2026-11-10  

---

## Status Overview

| TRD ID | Item | Owner | Status | Evidence / Artifact |
|---|---|---|---|---|
| **0.1** | Manual Production Backup (mongodump) | Admin (Manual) | ⏳ Awaiting Admin Action | `docs/runbooks/phase0-backup-restore.md` §3 |
| **0.2** | Restore backup into separate test cluster (mongorestore) | Admin (Manual) | ⏳ Awaiting Admin Action | `docs/runbooks/phase0-backup-restore.md` §4 |
| **0.2b** | Verify collection document counts | Automated / Admin | ✅ Tool Ready | `scripts/verify-counts.js` |
| **0.3** | Clone production data into staging cluster | Admin (Manual) | ⏳ Awaiting Admin Action | `docs/runbooks/phase0-backup-restore.md` §6 |
| **0.4** | Characterization regression suite | Agent (Automated) | ✅ Passed (21/21 tests) | `server/test/regression/phase0-characterization.test.js` |
| **Baseline** | Staging index list, collection sizes & explain plans | Automated / Doc | ✅ Generated & Tool Ready | `scripts/capture-baseline.js` & `docs/phase0-baseline.md` |

---

## Deliverables Index

1. **Runbook**: [`docs/runbooks/phase0-backup-restore.md`](./runbooks/phase0-backup-restore.md)
   - Step-by-step instructions for Atlas UI snapshot, `mongodump`/`mongorestore`, verification, and staging clone.
2. **Count Verifier**: [`scripts/verify-counts.js`](../scripts/verify-counts.js)
   - Read-only script querying `countDocuments({})` across all collections; outputs diff-ready JSON or formatted table; credentials redacted.
3. **Characterization Regression Suite**: [`server/test/`](../server/test/)
   - Safety harness refusing non-`test_` DBs and production hosts.
   - Comprehensive test suite (`server/test/regression/phase0-characterization.test.js`) covering all 12 scenario matrix requirements + status response shape.
4. **Baseline Performance & Schema Audit**: [`docs/phase0-baseline.md`](./phase0-baseline.md)
   - Pre-migration collection inventory, storage metrics, complete index inventory across all 15 collections, explain plans (`executionStats`), and p50/p95 latency benchmarks.
5. **Baseline Extraction Tool**: [`scripts/capture-baseline.js`](../scripts/capture-baseline.js)
   - CLI utility to re-capture baseline stats, explain plans, and latency benchmarks against any target staging cluster.

---

## Discrepancies & Characterization Observations in Existing Code

The following behaviors were identified during code inspection and characterization testing of the existing production codebase. Per TRD §5 Phase 0 rules (NC-6, NFR-5), characterization tests assert current behavior as-is without modifying existing production code:

1. **Zod 4 Property Mismatch Runtime Crash (`server/src/utils/validation.js`)**:
   - *Code Location:* `server/src/utils/validation.js` line 23:
     ```javascript
     const details = error.errors.map(err => ({ field: err.path.join('.'), message: err.message }));
     ```
   - *Issue:* The project uses Zod 4 (`"zod": "^4.3.6"`). In Zod 4, the property is `error.issues`, not `error.errors`.
   - *Impact:* Whenever schema validation fails on any payload (e.g. invalid date or malformed body), accessing `error.errors.map` throws an unhandled `TypeError: Cannot read properties of undefined (reading 'map')`, yielding an unexpected HTTP 500 server crash rather than an HTTP 400 validation response.
   - *Status:* Documented; characterization tests use valid payload shapes to avoid triggering this pre-existing bug.

2. **Batch Initiation on Class Without Core Subjects or Class Teacher**:
   - *Code Location:* `server/src/Controllers/batchController.js` (`_executeInitiation`)
   - *Observation:* The controller validates that active students exist (`if (!students.length) throw Error`), but does *not* reject initiation if `cls.subjectAssignments` is empty or if `cls.classTeacherId` is null. Instead, it generates warnings in `getDepartmentPreview`, but returns 201 Created if initiation is called directly.
   - *Status:* Characterization test (Scenario 9) asserts this exact current behavior.

3. **Faculty Removal Status Recalculation**:
   - *Code Location:* `server/src/Controllers/batchController.js` (`removeFacultyFromBatch`)
   - *Observation:* When an active batch removes a faculty member, `NodueApproval.deleteMany` removes pending records, but does not trigger `recalcRequestStatus` or `bulkRecalcRequestStatus` on affected student requests. If a student was pending only that faculty's approval, their status does not automatically transition to `cleared`.
   - *Status:* Characterization test (Scenario 12) locks down current behavior.

4. **SSE Controller Top-Level Interval Keeps Process Alive**:
   - *Code Location:* `server/src/Controllers/sseController.js` line 24:
     ```javascript
     setInterval(() => { ... }, 300_000);
     ```
   - *Observation:* The de-duplication cache cleanup timer runs every 5 minutes and is not `unref()`-ed. When imported in test environments, it prevents the Node.js event loop from exiting naturally until the timer fires.
   - *Status:* Handled in the test harness teardown without modifying production code.

5. **HoD Snapshot Separation**:
   - *Code Location:* `server/src/utils/batchSync.js` (`generateStudentSnapshotData`)
   - *Observation:* HoD/AO was removed from batch initiation snapshot generation in favor of the separate `POST /api/hod/override` administrative action.
   - *Status:* Characterized in Scenario 4 and Scenario 7.

---

## Manual Actions Remaining for Administrator

- [ ] **Step 0.1**: Execute client-side compressed backup via `mongodump` (see `docs/runbooks/phase0-backup-restore.md` §3).
- [ ] **Step 0.1b**: Record backup archive timestamp and path outside git.
- [ ] **Step 0.2**: Restore backup into isolated test database (`test_nodues_restore`) via `mongorestore` (see runbook §4).
- [ ] **Step 0.2b**: Run `node scripts/verify-counts.js <PROD_URI> --json` and `node scripts/verify-counts.js <TEST_URI> --json` and verify 0 diff.
- [ ] **Step 0.3**: Populate persistent staging database (`nodues_staging`) via `mongorestore` (see runbook §6).
- [ ] **Step 0.3b**: Re-run `node scripts/capture-baseline.js <STAGING_URI>` to capture live staging cluster metrics into `docs/phase0-baseline.md`.
- [ ] **Verification**: Confirm staging URI and safety isolation before Phase 1 begins.
