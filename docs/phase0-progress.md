# Phase 0 Progress & Safety Tracking
**Project:** No-Due Clearance System (NDS)  
**TRD Target:** Phase 0 — Safety Infrastructure (Steps 0.1 – 0.4)  
**Branch:** `phase-0-safety-net`  
**Last Updated:** 2026-11-10  

---

## Status Overview

| TRD ID | Item | Owner | Status | Evidence / Artifact |
|---|---|---|---|---|
| **0.1** | Manual Production Backup Snapshot | Admin (Manual) | ⏳ Awaiting Admin Action | `docs/runbooks/phase0-backup-restore.md` §Step 0.1 |
| **0.2** | Restore snapshot into separate test cluster | Admin (Manual) | ⏳ Awaiting Admin Action | `docs/runbooks/phase0-backup-restore.md` §Step 0.2 |
| **0.2b** | Verify collection document counts | Automated / Admin | ✅ Tool Ready | `scripts/verify-counts.js` |
| **0.3** | Clone production data into staging cluster | Admin (Manual) | ⏳ Awaiting Admin Action | `docs/runbooks/phase0-backup-restore.md` §Step 0.3 |
| **0.4** | Characterization regression suite | Agent (Automated) | 🔄 In Progress | `test/regression/phase0-characterization.test.js` |
| **Baseline** | Staging index list, collection sizes & explain plans | Automated / Doc | 🔄 In Progress | `docs/phase0-baseline.md` |

---

## Deliverables Index

1. **Runbook**: [`docs/runbooks/phase0-backup-restore.md`](./runbooks/phase0-backup-restore.md)
2. **Count Verifier**: [`scripts/verify-counts.js`](../scripts/verify-counts.js)
3. **Regression Suite**: [`test/regression/`](../test/regression/)
4. **Baseline Metrics**: [`docs/phase0-baseline.md`](./phase0-baseline.md)

---

## Discrepancies & Characterization Observations in Existing Code

The following behaviors were identified during code inspection of the existing production codebase. Characterization tests assert this exact current behavior without modifying existing code:

1. **Batch Initiation on Class Without Core Subjects or Class Teacher**:
   * *Code Location:* `server/src/Controllers/batchController.js` (`_executeInitiation`)
   * *Observation:* The controller validates that active students exist (`if (!students.length) throw Error`), but does *not* throw if `cls.subjectAssignments` is empty or if `cls.classTeacherId` is null. Instead, it generates warnings in the preview API (`getDepartmentPreview`), but proceeds with batch initiation if requested.
2. **Faculty Removal Status Recalculation**:
   * *Code Location:* `server/src/Controllers/batchController.js` (`removeFacultyFromBatch`)
   * *Observation:* When an active batch removes a faculty member, `NodueApproval.deleteMany` removes pending records, but does not trigger `recalcRequestStatus` or `bulkRecalcRequestStatus` on affected student requests.
3. **HoD Snapshot Separation**:
   * *Code Location:* `server/src/utils/batchSync.js` (`generateStudentSnapshotData`)
   * *Observation:* On 2026-04-29, HoD/AO was removed from the snapshot generation in favor of the separate `POST /api/hod/override` administrative action.

---

## Manual Actions Remaining for Administrator

- [ ] Execute Step 0.1: Take on-demand snapshot in Atlas Console (see runbook).
- [ ] Record snapshot timestamp and description in this file.
- [ ] Execute Step 0.2: Restore snapshot into isolated test database (`test_*`).
- [ ] Run `node scripts/verify-counts.js <PROD_URI>` and `node scripts/verify-counts.js <TEST_URI>` and verify zero diff.
- [ ] Execute Step 0.3: Restore snapshot into persistent `staging` cluster.
- [ ] Confirm staging URI and provide target connection string for migration rehearsal.
