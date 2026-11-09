# Technical Requirements Document (TRD)
## Batch-Semester Architecture, Persistent Classes, Timetable Parser & Safe Production Migration

**Project:** No-Due Clearance System (NDS) — live at nodues-arcclub.tech  
**Version:** 1.1  
**Date:** April 2026  
**Status:** Ready for Execution  
**Scope:** This TRD covers implementation of five features already locked in the Features Guide v1.0 (Batch-Based Semester Architecture, Persistent Class with Archived Subjects, Timetable PDF Parser, Action Registry, Build/Setup Wizard), plus the production-safe migration of ~2,100 existing real student records to the new schema.

> This document exists for one reason: the system is live, the data is real, and the team executing this (possibly future-Usman, possibly a collaborator) must not be able to misread intent, skip a safety step, or guess at an ambiguous requirement. Every requirement below has an ID, an acceptance criterion, and a test. If something isn't written here, it is not yet a requirement — raise it before building, not after.

---

## Table of Contents

1. [Purpose & Non-Negotiable Constraints](#1-purpose--non-negotiable-constraints)
2. [Functional Requirements](#2-functional-requirements)
3. [Non-Functional Requirements](#3-non-functional-requirements)
4. [Final Data Schemas — Single Source of Truth](#4-final-data-schemas--single-source-of-truth)
5. [Migration Plan — Phase by Phase](#5-migration-plan--phase-by-phase)
6. [Testing Requirements](#6-testing-requirements)
7. [Rollback Plan](#7-rollback-plan)
8. [Monitoring & Observability Requirements](#8-monitoring--observability-requirements)
9. [Definition of Done — Per Feature](#9-definition-of-done--per-feature)
10. [Required Documentation Set](#10-required-documentation-set)
11. [Appendix A — Blameless Postmortem Template](#appendix-a--blameless-postmortem-template)

---

## 1. Purpose & Non-Negotiable Constraints

### Purpose

Implement the five features in the Features Guide v1.0 against a **live production system holding real clearance data for ~2,100 students**, without corrupting, losing, or silently misrepresenting any existing student's academic record.

### Non-Negotiable Constraints

These are not suggestions. Any implementation that violates one of these is not acceptable regardless of how good the feature itself is:

- **NC-1:** No migration script runs against production without first running successfully against a staging clone of production data, with manual verification of a sampled set of real student records.
- **NC-2:** No migration script runs against production without a verified-restorable backup taken immediately prior.
- **NC-3:** Every migration script must be idempotent — safe to re-run without duplicating or corrupting data if it fails partway through.
- **NC-4:** Any change to how class identity or student semester is inferred (not directly stated by existing data) must go through a Preview → Confirm step reviewed by a human — never silently auto-committed.
- **NC-5:** Old fields (`academicYear`, flat `subjectAssignments[]`) remain present and functional for at least one full semester cycle after the new fields are introduced — no destructive removal until the new system has been proven correct in live use.
- **NC-6:** The existing approval/request/batch execution engine (status computation, approve/mark-due, HoD override) must not be modified by this work. These features only touch the setup/configuration layer above it.
- **NC-7:** All migration scripts must be written as tracked migrations using a migration framework (`migrate-mongo`), not as standalone ad-hoc scripts — each migration must record its own `up` (forward) and `down` (rollback) logic, and the framework's changelog is the single source of truth for what has and hasn't been applied to a given environment.
- **NC-8:** The Build/Setup Wizard and any new code path that replaces or sits alongside existing live functionality must be gated behind a database-backed feature flag that can be toggled without a redeploy — never released as an always-on code path on first launch.

---

## 2. Functional Requirements

Each requirement has an ID for traceability. Reference these IDs in code comments, PR descriptions, and test names.

### FR Group A — Batch & Semester

| ID | Requirement |
|---|---|
| FR-A1 | System shall allow creation of a `batch` entity identified by a label (e.g. "2024-2028") with a `startYear`, `endYear`, and `currentSemester`. |
| FR-A2 | On first student import into a class with no `currentSemester` set, the system shall prompt the admin to specify the current semester (1–8) before import can proceed. |
| FR-A3 | On subsequent imports into an already-configured class, the system shall NOT prompt for semester — new students silently inherit the class's current semester. |
| FR-A4 | System shall provide an "Advance Semester" action, scoped to one batch, that increments `currentSemester` by 1 and cascades the new value to every class and student linked to that batch, except students with a `semesterOverride` set. |
| FR-A5 | If `currentSemester` would exceed 8 after advancing, the batch shall be marked `isActive: false` ("graduated") and no further advancement shall be permitted on it. |
| FR-A6 | A student's `semesterOverride`, when set, shall take precedence over the batch-derived semester for all downstream logic (batch initiation, status display) for that student only. |
| FR-A7 | No semester value shall ever be computed from the current date in any code path. Semester is always either (a) explicitly set by an admin, or (b) inherited from the batch via FR-A4. |

### FR Group B — Persistent Class & Archived Subjects

| ID | Requirement |
|---|---|
| FR-B1 | A `class` document shall persist across all semesters of a section's lifetime — it shall not be recreated when a section advances to a new semester. |
| FR-B2 | Subject assignments shall be stored per-semester within the class document under `semesterSubjects[semesterNumber]`, never as a single flat array representing "current" subjects only. |
| FR-B3 | When a new semester's subjects are set (via timetable parse, manual assignment, or clone), any previous semester's subject entry for that class shall have its `status` set to `"archived"` and shall remain queryable, never deleted. |
| FR-B4 | Batch initiation shall read subjects exclusively from `class.semesterSubjects[class.currentSemester]` where `status === "active"`. |
| FR-B5 | System shall expose an endpoint to retrieve a class's full subject history across all archived and active semesters. |

### FR Group C — Timetable PDF Parser

| ID | Requirement |
|---|---|
| FR-C1 | System shall accept a PDF file upload and extract the subject summary table (columns: Subject Name, Faculty Name, Total no of Hours) using text-layer extraction only — no OCR, no AI/ML inference. |
| FR-C2 | System shall reject, with a clear error message, any uploaded file that has no extractable text layer (i.e., is an image-only/scanned PDF), rather than silently producing empty or garbage output. |
| FR-C3 | For any subject row where the faculty field equals (case-insensitive, whitespace-normalized) "without teacher", the system shall exclude that subject from the resulting subject assignment list entirely — no approval shall ever be generated for it. |
| FR-C4 | For any subject row listing multiple faculty names (comma-separated), the system shall designate the first-listed name as the approving faculty and store all remaining names as non-approving `coFacultyIds` references only. |
| FR-C5 | Extracted faculty names shall be normalized (strip honorifics, periods, extra whitespace, case-fold) before matching against the `faculty` collection by name. |
| FR-C6 | Subject codes extracted from the table shall be matched against the `subjects` collection by exact code match. |
| FR-C7 | The parser shall never auto-commit extracted data directly into a class's live subject assignments. It shall always return a preview result first, requiring an explicit separate "commit" action from the admin. |
| FR-C8 | Any row where subject code or faculty name cannot be matched shall be flagged in the preview response as requiring manual review, and must not be silently included or silently excluded from the commit payload — it is surfaced to the admin to resolve explicitly. |

### FR Group D — Action Registry

| ID | Requirement |
|---|---|
| FR-D1 | Every backend operation invoked by the Setup Wizard shall be implemented as a named entry in a central action registry with a declared input schema and handler function. |
| FR-D2 | The action registry shall be an internal backend construct only — no end-user-facing interface shall expose "actions" or "tools" as a concept; the user interacts only with the Setup Wizard UI. |
| FR-D3 | Each action execution shall be independently unit-testable without requiring the full wizard flow to be exercised. |
| FR-D4 | Each action execution shall emit a structured log entry (actor, action id, input summary, result, timestamp) suitable for audit log consumption. |

### FR Group E — Build/Setup Wizard

| ID | Requirement |
|---|---|
| FR-E1 | The wizard shall enforce a fixed step order: Class Info → Timetable/Subjects → Students → Mentors → Electives (conditional) → Pre-flight Checklist → Batch Initiation. |
| FR-E2 | The wizard shall not permit batch initiation until the pre-flight checklist (students present, subjects present, class teacher assigned) passes. |
| FR-E3 | The wizard shall persist progress such that an admin can leave mid-flow and resume from the last completed step, scoped per class. |
| FR-E4 | The wizard shall not remove or disable the existing standalone admin pages (Classes, Students, Faculty management) during this release — both paths remain available in parallel until the wizard has been used successfully for at least one real semester setup. |

### FR Group F — Migration Tooling & Feature Flags

| ID | Requirement |
|---|---|
| FR-F1 | Every migration (Phase 2, Phase 3, and any future schema change) shall be implemented as a `migrate-mongo` migration file with both `up` and `down` exports — `down` must perform a genuine logical rollback, not a no-op placeholder. |
| FR-F2 | The migration changelog (maintained automatically by `migrate-mongo` in a `changelog` collection) shall be treated as authoritative for "has this run" — no manual tracking of migration status via comments, spreadsheets, or memory. |
| FR-F3 | A `featureFlags` collection shall exist, keyed by flag name, checked at request-time by any gated route — no flag state shall be hardcoded or require a redeploy to change. |
| FR-F4 | `setup_wizard_enabled` shall be the first flag created under FR-F3, defaulting to `false` in production until Phase 5 cutover is intentionally ready to begin. |
| FR-F5 | Flipping a feature flag shall take effect within one request cycle — no caching of flag state beyond a single request, or at most a short TTL (≤10s) if caching is used for performance. |

---

## 3. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | All new collections/fields must have indexes defined before any production query uses them in a hot path (see API Performance Guide §2.1 conventions). |
| NFR-2 | Timetable parsing for a single PDF (typical size, ~15–20 subject rows) must complete and return a preview response in under 3 seconds. |
| NFR-3 | The "Advance Semester" cascade operation, affecting up to ~700 students in one batch, must complete as a single bulk operation — not per-document sequential updates (see API Performance Guide §6.2). |
| NFR-4 | Migration scripts must log per-record outcome (success/skip/error) to allow post-migration auditing of exactly what changed for which student. |
| NFR-5 | No migration or feature in this release may alter the response shape of any currently-live API endpoint consumed by the existing frontend, unless the frontend is updated in the same deployment. |

---

## 4. Final Data Schemas — Single Source of Truth

> This section supersedes any schema shown in the Features Guide or PRD v4 where they differ — this is the authoritative version for implementation.

### `batches`

```json
{
  "_id": "ObjectId",
  "label": "2024-2028",
  "startYear": 2024,
  "endYear": 2028,
  "currentSemester": 5,
  "isActive": true,
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### `classes`

```json
{
  "_id": "ObjectId",
  "name": "CSD-A",
  "batchId": "ObjectId → batches",
  "departmentId": "ObjectId → departments",
  "classTeacherId": "ObjectId → faculty",
  "semesterSubjects": {
    "<semesterNumber as string>": {
      "subjects": [
        {
          "subjectId": "ObjectId → subjects",
          "subjectName": "String",
          "subjectCode": "String",
          "facultyId": "ObjectId → faculty",
          "facultyName": "String",
          "coFacultyIds": ["ObjectId"],
          "source": "timetable_parse | manual | cloned"
        }
      ],
      "status": "active | archived",
      "setAt": "Date",
      "archivedAt": "Date | null"
    }
  },
  "studentIds": ["ObjectId"],
  "isActive": true,
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### `students` (fields added/changed only)

```json
{
  "batchId": "ObjectId → batches",
  "currentSemester": "Number",
  "semesterOverride": "Number | null",
  "classId": "ObjectId → classes"
}
```

### `timetableUploads` (new — audit trail for parser, not used by core logic)

```json
{
  "_id": "ObjectId",
  "classId": "ObjectId → classes",
  "targetSemester": "Number",
  "uploadedBy": "ObjectId → admins/faculty",
  "originalFileName": "String",
  "parsedRowCount": "Number",
  "matchedRowCount": "Number",
  "flaggedRowCount": "Number",
  "committed": "Boolean",
  "committedAt": "Date | null",
  "createdAt": "Date"
}
```

> Keeping every upload as an audit record answers "what did the timetable actually say" months later if a subject assignment is ever disputed.

---

## 5. Migration Plan — Phase by Phase

### Phase 0 — Safety Infrastructure (must complete before any other phase)

| Step | Action | Verification |
|---|---|---|
| 0.1 | Take manual production backup snapshot | Snapshot exists, timestamped, documented |
| 0.2 | Restore snapshot into a separate test cluster | Restore completes, record counts match production |
| 0.3 | Clone production data into a persistent staging cluster | Staging holds a working copy for ongoing testing |
| 0.4 | Write regression suite covering: status computation, batch initiation, student status endpoint shape, HoD override | Suite passes against staging's current (pre-migration) data |

**Phase 0 exit criterion:** Suite is green against staging, backup is confirmed restorable, staging cluster is available for all subsequent testing. No Phase 1 work merges to main without this.

---

### Phase 1 — Additive Schema Introduction (no existing data touched)

| Step | Action |
|---|---|
| 1.0 | Install and configure `migrate-mongo`; verify it connects to staging and production configs correctly before writing any real migration |
| 1.0b | Create `featureFlags` collection; seed `setup_wizard_enabled: false` |
| 1.1 | Add `batches` collection (empty, no data yet) |
| 1.2 | Add new fields to `classes` and `students` schemas as optional/nullable — existing documents remain valid without them |
| 1.3 | Deploy Timetable Parser (FR-C1–C8) — operates only on new uploads, touches no existing data |
| 1.4 | Deploy Action Registry refactor (FR-D1–D4) behind existing routes — handlers change internally, external API contracts unchanged |

**Phase 1 exit criterion:** All existing live functionality verified unchanged (regression suite green against staging AND a smoke test against production reads). New fields exist but are not yet populated or relied upon anywhere.

---

### Phase 2 — Batch Inference Migration (deterministic, scriptable)

| Step | Action |
|---|---|
| 2.1 | Write `20260415-infer-batches.js` as a `migrate-mongo` migration (FR-F1): `up` computes `batchStartYear` from existing `academicYear` + `semester` (see formula in Features Guide §2), creates/matches a `batches` document, sets `student.batchId` and `student.currentSemester = student.semester`; `down` removes `batchId`/`currentSemester` from students and deletes any `batches` documents this migration created |
| 2.2 | Run `migrate-mongo up` against **staging**; manually verify a sampled set of ≥20 students across all three departments and multiple semesters — confirm each one's inferred batch is correct |
| 2.3 | Confirm idempotency: run `migrate-mongo up` a second time against staging (framework should no-op since changelog shows it already applied); additionally test `migrate-mongo down` then `up` again to confirm the rollback path genuinely works |
| 2.4 | Take a fresh production backup |
| 2.5 | Run `migrate-mongo up` against production |
| 2.6 | Spot-check the same sampled students' production records post-migration; confirm changelog entry recorded |

**Phase 2 exit criterion:** Every active student has a valid `batchId` and `currentSemester`. Old `academicYear`/`semester` fields remain untouched and still readable (NC-5).

---

### Phase 3 — Class Identity Consolidation (requires human review — NC-4)

| Step | Action |
|---|---|
| 3.1 | Run `proposeClassMerges.js` against staging — computes student-roster overlap between same-named-prefix classes across semesters, outputs a proposed mapping table with confidence scores |
| 3.2 | Admin reviews every proposed mapping (expected: ~10–15 total across 3 departments) — confirms, corrects, or rejects each one |
| 3.3 | On confirmation, run `commitClassMerge.js` for each approved mapping against staging: creates/updates the single persistent class document, populates `semesterSubjects` for each contributing semester, sets correct `active`/`archived` status per entry |
| 3.4 | Verify in staging: pick 3 merged classes, confirm their full subject history (archived + active) matches what existed in the original separate documents |
| 3.5 | Fresh production backup |
| 3.6 | Repeat 3.1–3.4 against production, with the same human review step — no auto-commit |

**Phase 3 exit criterion:** Every class the admin confirmed is now one persistent document with correctly archived/active semester subject entries. Any class not confirmed remains in its old form, untouched, for manual follow-up later.

---

### Phase 4 — Shadow Verification

| Step | Action |
|---|---|
| 4.1 | Deploy shadow-mode comparison: for any code path that would use the new batch/semester fields in a way that affects output, compute the old-style result alongside it and log any mismatch — do not act on the new result yet |
| 4.2 | Run for minimum 1 week against production (data is real but dormant — safe to observe without risk, since no live batches are being initiated this month) |
| 4.3 | Review logs — zero tolerance for unexplained mismatches before proceeding |

**Phase 4 exit criterion:** Zero unexplained mismatches between old and new computation across the full student population for at least 7 consecutive days.

---

### Phase 5 — Cutover

| Step | Action |
|---|---|
| 5.1 | Switch live code paths to read from new fields (`batchId`, `currentSemester`, `semesterSubjects`) as primary source |
| 5.2 | Keep old fields present and un-deleted (NC-5) |
| 5.3 | Flip `setup_wizard_enabled` to `true` (FR-F4) — the wizard code has already been deployed since Phase 1/dark-launched, so this step is a flag flip, not a deployment |
| 5.4 | Confirm existing standalone admin pages remain fully functional alongside the now-enabled wizard (FR-E4) |
| 5.5 | Monitor error rates and the audit log closely through the first real semester-advancement and batch-initiation cycle that uses the new system |
| 5.6 | If any issue surfaces during 5.5, flip `setup_wizard_enabled` back to `false` immediately — this requires no redeploy and takes effect within one request cycle (FR-F5) — then investigate in staging before re-enabling |

**Phase 5 exit criterion:** One full real semester cycle completed successfully using the new architecture, with no incident requiring rollback.

---

## 6. Testing Requirements

| Test Type | Required Coverage |
|---|---|
| Unit | Semester arithmetic, overlap score computation, timetable row parsing/normalization, faculty name matching |
| Integration | Full migration script run against a staging snapshot, idempotency re-run, wizard step sequencing |
| Regression (pre-existing behavior) | Status computation, batch initiation, approve/mark-due, HoD override, student status endpoint — must show zero behavior change pre- vs post-migration for a fixed sample of real students |
| Manual Verification | Minimum 20 sampled real students checked by eye post-migration, across all 3 departments, including at least one each of: cleared, pending, has_dues, hod_override, and a backlog/override student |

No phase in Section 5 proceeds to production without its corresponding tests passing in staging first.

---

## 7. Rollback Plan

| Trigger | Action |
|---|---|
| Migration script fails partway through (Phase 2 or 3) | Script is idempotent (NC-3) — fix the issue, re-run safely. No manual cleanup required by design. |
| Post-migration data verification fails in staging | Do not proceed to production. Fix script, re-run Phase 2/3 against staging from the pre-verified backup restore. |
| Post-migration issue discovered in production after cutover | Restore from the pre-migration backup snapshot (0.1/2.4/3.5/5 as applicable) into production; old fields were never removed (NC-5), so the system can continue operating on old logic while the issue is fixed in staging. |
| Shadow mode (Phase 4) shows unexplained mismatches | Do not proceed to Phase 5. Investigate and resolve before any cutover. |

---

## 8. Monitoring & Observability Requirements

| ID | Requirement |
|---|---|
| MON-1 | Every action registry execution (FR-D4) logged with actor, action, input, result |
| MON-2 | Shadow-mode mismatches (Phase 4) logged at `warn` level with both computed values |
| MON-3 | Migration scripts log per-record outcome to a dedicated migration log file/collection, not mixed into general application logs |
| MON-4 | Timetable parse/commit actions logged via `timetableUploads` collection (Section 4) for audit purposes |

---

## 9. Definition of Done — Per Feature

A feature is not "done" until all of the following are true, not just "the code works":

| Feature | Done When |
|---|---|
| Batch-Based Semester | FR-A1–A7 implemented and tested; Phase 2 migration completed on production; shadow verification (Phase 4) shows zero mismatches for 7 days |
| Persistent Class + Archived Subjects | FR-B1–B5 implemented; Phase 3 migration completed on production with full admin review; subject history endpoint verified against at least 3 real classes |
| Timetable PDF Parser | FR-C1–C8 implemented and tested against at least 2 real timetable PDFs from different departments; preview/commit flow produces zero silent auto-matches on ambiguous rows |
| Action Registry | FR-D1–D4 implemented; all existing routes refactored without regression suite failures |
| Build/Setup Wizard | FR-E1–E4 implemented; used successfully end-to-end for at least one real class setup before old manual pages are deprecated |

---

## 10. Required Documentation Set

To make this project impossible to misunderstand — for you in six months, or for anyone else who touches it — the following documents should exist, each with a single clear purpose. No two documents should duplicate the same information as its primary source.

| Document | Purpose | Status |
|---|---|---|
| **PRD** (`nodue-prd-v4.md`) | What the product does and why, for every role (Admin, HoD, Faculty, Student) | Exists |
| **Features Guide** (`features_guide.md`) | Conceptual design of the 5 new features — the "what and why," written for understanding intent | Exists |
| **This TRD** (`trd_migration_v1.md`) | Authoritative technical requirements, final schemas, and the exact migration execution plan — the "how, precisely" | This document |
| **API Design Guide** (`api_design_guide.md`) | Every endpoint, request/response shape — single contract between frontend and backend | Exists — needs an update pass to add the new endpoints from Features Guide §8 |
| **API Performance Guide** (`api_performance_guide.md`) | How to keep every endpoint fast at scale | Exists |
| **Migration Runbook** *(recommended new)* | A literal day-of checklist — exact `migrate-mongo` commands and feature-flag toggles to run, in exact order, with checkboxes — distilled from Section 5 of this TRD into an operational checklist with no explanatory prose, meant to be followed step by step during actual execution |
| **Architecture Decision Records (ADRs)** *(recommended new)* | One short file per major decision (why batch-over-date-calculation, why persistent-class-over-recreate, why action-registry-over-free-form) — captures the reasoning so a future contributor can't accidentally "fix" something that was a deliberate tradeoff |
| **Data Dictionary** *(recommended new)* | One single file listing every collection's current authoritative schema, superseding scattered schema snippets across PRD/Features Guide/TRD — prevents the "which version of this schema is correct" problem as the project accumulates more documents over time |

### Why the ADRs Specifically Matter Here

Several decisions in this project were deliberately chosen over a simpler-looking alternative — batch-counter over date math, Preview-before-commit over silent auto-matching, keeping old fields alive over clean deletion. Without a record of *why*, a future change (by you, months from now, having forgotten the reasoning, or by anyone else) could easily "simplify" one of these back toward the rejected alternative and reintroduce the exact fragility this TRD was written to eliminate. A one-paragraph ADR per decision is cheap insurance against that.

---

---

## Appendix A — Blameless Postmortem Template

To be filled out immediately after any incident during this migration — however small — regardless of whether it affected a real user. The point is capturing what the *system* allowed, not who made a mistake. Five minutes spent here is what turns an incident into a permanently sharper TRD instead of a repeated gap.

```markdown
## Incident: [date] — [one-line summary]

**What happened:**
[Factual sequence of events — no blame language, just what occurred]

**What the user-facing impact was:**
[Did any real student/faculty/HoD see incorrect data? For how long?]

**Which safety net caught this, or should have but didn't:**
[Was this supposed to be caught by Phase 0 tests? Shadow mode? Manual review?
 If it should have been caught and wasn't, that gap is the real finding.]

**Root cause:**
[The actual mechanism — e.g. "migration script assumed X but production had Y"]

**What changes as a result:**
[ ] TRD requirement added/updated: ___
[ ] New test added covering this case: ___
[ ] Runbook step clarified: ___
[ ] Feature flag used to mitigate: yes/no

**Time to detect:** ___
**Time to resolve:** ___
```

Store completed postmortems alongside the ADRs (Section 10) — they serve the same purpose: preventing the same mistake from being silently reintroduced later by someone (including future-you) who wasn't there for the original incident.

---

*End of TRD v1.0 — No-Due Clearance System, MITS*  
*This document is authoritative for schema and migration execution. Any deviation during implementation must be reflected back into this document, not left undocumented.*