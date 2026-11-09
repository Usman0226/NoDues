# Features Guide
## Build/Setup Tab & Batch-Semester Architecture

**Project:** No-Due Clearance System (NDS)  
**Version:** 1.0  
**Date:** April 2026  
**Status:** Design Locked — Ready for Implementation

> This guide documents two connected feature additions: the **Build/Setup tab** (timetable-driven class setup, powered by an internal action registry) and the **batch-based semester architecture** (replacing academic-year date logic with explicit admin-driven progression). Both were designed together because the Setup tab is the primary place these architectural changes surface to the user.

---

## Table of Contents

1. [Why These Features Exist](#1-why-these-features-exist)
2. [Feature A — Batch-Based Semester Architecture](#2-feature-a--batch-based-semester-architecture)
3. [Feature B — Persistent Class with Archived Subject History](#3-feature-b--persistent-class-with-archived-subject-history)
4. [Feature C — Timetable PDF Parser](#4-feature-c--timetable-pdf-parser)
5. [Feature D — Action Registry](#5-feature-d--action-registry)
6. [Feature E — Build/Setup Tab (Wizard)](#6-feature-e--buildsetup-tab-wizard)
7. [Database Schema Changes](#7-database-schema-changes)
8. [API Additions](#8-api-additions)
9. [Migration Notes](#9-migration-notes)

---

## 1. Why These Features Exist

The single biggest adoption risk for NDS isn't the approval logic — it's **setup friction**. Every semester, an admin has to manually recreate class structure: type in 8–12 subjects, match each to the correct faculty, and keep semester numbers updated by hand. That's tedious, error-prone, and is exactly the kind of task that causes staff to quietly go back to paper.

These five features remove that friction:

| Problem | Feature | Fix |
|---|---|---|
| Semester tracking relies on fragile date math or manual per-student updates | Batch-Based Semester Architecture | Semester becomes an explicit, admin-set counter — no calendar guessing |
| Subject-faculty history is lost every time a class moves to a new semester | Persistent Class + Archived Subjects | One class document per section for its full 4-year life; old semesters archived, not deleted |
| Manually typing 8–12 subjects + faculty per class, every semester | Timetable PDF Parser | Upload the timetable PDF the college already generates — subjects and faculty extracted automatically |
| Backend capabilities are scattered across routes, hard to reuse or compose | Action Registry | Every backend operation registered once, reusable across the wizard and future UI |
| Class setup happens as disconnected manual steps across different pages | Build/Setup Tab (Wizard) | One guided flow — timetable → students → mentors → electives → batch, in sequence |

---

## 2. Feature A — Batch-Based Semester Architecture

### The Problem With the Old Approach

The original design tracked `academicYear` (e.g. "2025-26") as a field that had to be manually updated on every class and student, every semester, by an admin. If forgotten, the whole system silently uses stale data. An alternative considered — computing semester automatically from today's date — was rejected because real semester start dates drift year to year (NAAC visits, elections, exam reschedules) and a single wrong assumption would silently mis-assign the semester for hundreds of students with no warning.

### The Solution

Semester is not calculated. It is **declared once by the admin at first student import**, then **advanced explicitly** by the admin at the start of each following semester. No date logic is involved anywhere in the core system.

### How It Works

**Step 1 — First-time declaration (at initial student import for a new batch/class):**

```
Admin imports students into a brand-new class for the first time
      │
      ▼
System detects: this class has no currentSemester set yet
      │
      ▼
Prompts: "What semester are these students currently in?"
         [Dropdown: Semester 1 – 8]
      │
      ▼
Admin selects → value is stored on the batch (and inherited by the class)
```

**Step 2 — Every semester after, advancing:**

```
Admin → Batches → 2024-2028 → "Advance Semester" button
      │
      ▼
Shows: "Currently: Semester 5 → Advance to: Semester 6"
      │
      ▼
[Confirm] → semester + 1
      │
      ▼
Cascades automatically to:
  ├── All classes linked to this batch
  └── All students in those classes (unless they have a manual override)
      │
      ▼
If new semester > 8 → batch marked graduated, isActive: false
```

**Step 3 — Later student imports into an already-set-up class:**

New students (late joiners, additional sections) silently inherit the class's existing `currentSemester` — the prompt only ever appears once per class, at genuine first setup.

### Backlog / Repeat Students

A student whose actual semester doesn't match their batch's current semester (repeating a year, backlog) gets a `semesterOverride` field on their own record. This value takes precedence over the batch-derived semester for that one student only — everyone else in the class advances normally.

### Why This Is More Robust Than Date-Based Calculation

- Zero dependency on when semesters actually start each year
- Zero silent failure mode — nothing updates unless an admin explicitly clicks "Advance"
- Matches how admins already think about the problem — "these are 3rd year students" is something they know at setup time, not something a formula should guess
- Academic year label (e.g. "2026-27") for display purposes only, computed cosmetically from `batchStartYear + floor((semester-1)/2)` — never used in any business logic

---

## 3. Feature B — Persistent Class with Archived Subject History

### The Problem With the Old Approach

Originally, a new `class` document was implicitly created each semester ("CSE-A Sem 5" as a separate entity from "CSE-A Sem 6"). This meant no continuity — the class as an entity didn't persist across a section's full 4-year life, and there was no natural place to keep a history of which subjects and faculty were assigned in past semesters.

### The Solution

A class (e.g. "CSD-A") is now a **single persistent document that exists for the section's entire 4-year lifetime**. Subject assignments are stored **per semester** within that one document — every past semester's subject list is kept, marked `archived`, never deleted.

### Structure

```
Class: CSD-A (one document, exists Year 1 through Year 4)
  │
  ├── Semester 3 subjects → status: archived
  ├── Semester 4 subjects → status: archived
  ├── Semester 5 subjects → status: active   ← current
  └── (Semester 6 subjects added when timetable is next uploaded)
```

When a new timetable is uploaded for the next semester, the previous semester's subject list is automatically flipped to `archived` and the new one becomes `active`. Nothing is overwritten or lost.

### Why This Matters

- A full 4-year subject and faculty history per class, useful if a student disputes a past clearance or needs a transcript-style record
- Batch initiation always reads from exactly one place — the class's currently active semester's subject list — with no ambiguity
- Sets up the class entity to naturally support future features like "show me what CSD-A studied in Semester 3" without any redesign

---

## 4. Feature C — Timetable PDF Parser

### The Insight That Makes This Tractable

The weekly timetable grid (Mon–Sat × 7 periods, merged cells, lunch breaks) is genuinely difficult to parse reliably. But NDS doesn't need the weekly grid at all — it only needs the **subject summary table** that timetable software already prints at the bottom of the document:

```
Subject Name                              | Faculty Name          | Total no of Hours
23CSD107 - Introduction to ML             | Mr. A Kalyan Kumar    | 3
23CSD205 - Introduction to ML Laboratory  | Mr. A Kalyan Kumar,
                                             Mr. K Durga Charan,
                                             Mr. B Bhaskar         | 3
23CSD701 - Summer Internship I            | Without teacher       | 4
```

This is a clean, consistent 3-column table. Extracting this — rather than reconstructing the weekly grid — is a solved, deterministic engineering problem, not a computer-vision problem.

### Requirement — PDF, Not Image

This parser works reliably **only on a genuine PDF export** (one with a real text layer), such as those generated directly by timetable software like aSc Timetables. A photographed or scanned image has no text layer to extract — that would require OCR, which was explicitly ruled out. All timetable uploads must be sourced as PDF exports, not photos.

### Parsing Pipeline (No AI, No OCR)

```
1. Extract all text + (x, y) coordinates from the PDF
   → pure text extraction, no AI involved

2. Locate the header row
   → search for exact strings: "Subject Name", "Faculty Name", "Total no of Hours"
   → this header format is a fixed template from the timetable software

3. Cluster all text below that row into rows (by y-coordinate) 
   and columns (by x-coordinate ranges established by the header)

4. Parse each row:
   → split "23CSD107 - Introduction to ML" into code + name
   → split faculty column on commas into an array of names
   → parse hours as an integer

5. Apply the two business rules:
   → faculty === "Without teacher" → excluded entirely, no approval generated
   → faculty array has multiple names → first name is the approving faculty;
     remaining names stored as co-faculty for reference only, not as separate approvers
```

### Faculty Name Matching

Extracted faculty names are normalized before matching against the `faculty` collection, to handle inconsistent formatting between the timetable and the database:

```
"Dr. M. Chandra Sekhar" → strip titles, periods, extra whitespace, lowercase
                        → "m chandra sekhar"

"M Chandra Sekhar" (in DB) → same normalization → "m chandra sekhar"
                            → Match
```

Subject codes match with near-100% reliability (they're unique identifiers). Faculty name matching is expected at 85–95% automatic accuracy — the remainder are flagged for manual linking, never silently guessed.

### Preview-Before-Commit — Same Pattern as Existing Imports

This reuses the exact Preview → Confirm pattern already used for student, faculty, elective, and mentor imports elsewhere in NDS — no new UX pattern invented.

```
Upload Timetable PDF
      │
      ▼
Parsed Preview Table:

Subject Code | Subject Name         | Faculty                | Hours | Include?
23CSD107     | Intro to ML          | Kalyan Kumar (matched)  | 3     | Yes
23CSD205     | ML Lab               | Kalyan Kumar (approver),
                                       + 2 co-faculty          | 3     | Yes
23CSD701     | Summer Internship I  | Without teacher         | 4     | No (excluded)
23CSD108     | Big Data Analytics   | "G Rajkumar" —
                                        no match found          | 3     | Needs review
      │
      ▼
Admin reviews, fixes flagged rows inline, confirms
      │
      ▼
[Confirm & Apply] → class.semesterSubjects[currentSemester] populated in one action
```

The review step is deliberate, not a limitation — a 90%+ accurate extraction with a two-minute review is still dramatically faster than typing 12 subjects manually, and it avoids ever silently committing a wrong faculty match.

---

## 5. Feature D — Action Registry

### The Idea

Every backend capability NDS has — create a class, import students, parse a timetable, assign a mentor, initiate a batch — gets registered once as a named, self-describing unit with declared inputs, a category, and a handler function. This is an internal code-organization pattern, not a user-facing concept — the user never sees "actions" or "tools," they see a normal wizard UI.

### Structure

```javascript
// registry/actions.js
export const actionRegistry = {
  'class.create': {
    label: 'Create Class',
    category: 'setup',
    handler: classService.createClass,
    inputSchema: { name: 'string', departmentId: 'ObjectId', batchId: 'ObjectId' },
  },
  'timetable.parse': {
    label: 'Parse Timetable PDF',
    category: 'setup',
    handler: timetableService.parseAndPreview,
    inputSchema: { file: 'binary', classId: 'ObjectId' },
  },
  'timetable.commit': {
    label: 'Apply Parsed Subjects',
    category: 'setup',
    handler: timetableService.commitSubjects,
    inputSchema: { classId: 'ObjectId', rows: 'array' },
  },
  'students.import': {
    label: 'Import Students',
    category: 'setup',
    handler: importService.commitStudents,
    inputSchema: { classId: 'ObjectId', rows: 'array' },
  },
  'mentors.assign': {
    label: 'Assign Mentors',
    category: 'setup',
    handler: importService.commitMentors,
    inputSchema: { rows: 'array' },
  },
  'electives.assign': {
    label: 'Assign Electives',
    category: 'setup',
    handler: importService.commitElectives,
    inputSchema: { rows: 'array' },
  },
  'batch.initiate': {
    label: 'Initiate No-Due Batch',
    category: 'batch',
    handler: batchService.initiate,
    inputSchema: { classId: 'ObjectId', semester: 'number' },
  },
  'batch.advanceSemester': {
    label: 'Advance Batch Semester',
    category: 'batch',
    handler: batchService.advanceSemester,
    inputSchema: { batchId: 'ObjectId' },
  },
}
```

### Why This Was Chosen Over a Free-Form "Pick Your Own Tools" System

A fully open system where admins freely combine actions in any order was considered and deliberately rejected — it's over-engineering for a college tool with a handful of admins, and it introduces risk (an admin could initiate a batch before students are imported, for example). Instead, the registry powers a **fixed, sensible sequence** in the wizard. The registry gives you internal reusability and testability; the wizard gives the user a safe, guided order.

### Concrete Benefits

- The same `class.create` action can power both the Setup wizard and any future "quick create" shortcut elsewhere, with zero duplicated logic
- Every action is independently unit-testable
- Every action execution is a natural hook for the audit log — actor, action name, input, and result can be logged in one consistent place across the entire system
- Adding a new step to the wizard later (e.g. a clearance-item setup step) means registering one new action, not rebuilding wizard logic

---

## 6. Feature E — Build/Setup Tab (Wizard)

### Purpose

Consolidates everything needed to stand up a class for a new semester into one guided flow, replacing what was previously several disconnected manual steps across different admin pages.

### The Flow

```
Build/Setup Tab
  │
  Step 1 — Class Info
    → Create new class, or select existing persistent class
    → If existing class + new semester: confirm semester number
  │
  Step 2 — Timetable Upload
    → Upload timetable PDF → auto-extract subjects + faculty (Feature C)
    → OR "Clone subject structure from another class" (existing feature, for
      multi-section departments like CSD-A through CSD-E)
  │
  Step 3 — Student Import
    → Upload Roll No | Name | Email
    → First-time only: prompt for current semester (Feature A)
  │
  Step 4 — Mentor Assignment
    → Bulk import (Roll No | Faculty Employee ID) or manual per-student
  │
  Step 5 — Elective Assignment (if semester is applicable)
    → Bulk import (Roll No | Subject Code | Faculty Employee ID) or manual
  │
  Step 6 — Pre-Flight Checklist
    - Subjects assigned      - Students imported
    - Class teacher set      - Mentors assigned
  │
  Step 7 — Initiate No-Due Batch
    → Fires the existing batch initiation engine, unchanged
```

### What's Genuinely New vs. What's Consolidation

Only **Step 2's timetable parsing** and the **wizard shell itself** are new engineering work. Steps 3, 4, 5, and 7 already exist in NDS as standalone features — the wizard's job is to sequence them, carry context between steps (e.g. `classId` flows automatically from Step 1 into every later step), and prevent batch initiation until the checklist is satisfied.

### Design Principle

The wizard enforces a **safe, fixed order** — it does not allow initiating a batch before students are imported, or assigning electives before the class exists. This constraint is intentional: it's the main safeguard against the kind of setup mistakes that the old disconnected-pages approach made easy to fall into.

---

## 7. Database Schema Changes

### `batches` (new collection)

```json
{
  "_id": "ObjectId",
  "label": "2024-2028",
  "startYear": 2024,
  "endYear": 2028,
  "currentSemester": 5,
  "isActive": true,
  "createdAt": "Date"
}
```

### `classes` (updated)

```json
{
  "_id": "ObjectId",
  "name": "CSD-A",
  "batchId": "ObjectId → batch",
  "departmentId": "ObjectId → department",
  "classTeacherId": "ObjectId → faculty",
  "semesterSubjects": {
    "3": {
      "subjects": [
        { "subjectId": "...", "subjectName": "OS", "subjectCode": "CS302",
          "facultyId": "...", "facultyName": "Dr. Meena", "coFacultyIds": [] }
      ],
      "status": "archived",
      "archivedAt": "Date"
    },
    "5": {
      "subjects": [
        { "subjectId": "...", "subjectName": "ML", "subjectCode": "CS501",
          "facultyId": "...", "facultyName": "Dr. Kumar",
          "coFacultyIds": ["...", "..."] }
      ],
      "status": "active",
      "setAt": "Date",
      "sourceType": "timetable_parse | manual | cloned"
    }
  },
  "studentIds": ["ObjectId"],
  "isActive": true
}
```

> `coFacultyIds` stores additional faculty listed for a subject (e.g. lab sessions with 3 instructors) for reference only — they are not separate approvers. Only the first-listed faculty (`facultyId`) generates an approval record.

### `students` (updated)

```json
{
  "_id": "ObjectId",
  "rollNo": "23CSD501",
  "batchId": "ObjectId → batch",
  "currentSemester": 5,
  "semesterOverride": null,
  "classId": "ObjectId → class",
  "isActive": true
}
```

---

## 8. API Additions

| Method | Endpoint | Use |
|---|---|---|
| POST | `/api/batches` | Create a new batch (e.g. "2024-2028") |
| GET | `/api/batches` | List all batches with current semester and status |
| POST | `/api/batches/:id/advance-semester` | Advance a batch's semester by 1 — cascades to classes and students |
| POST | `/api/classes/:id/timetable/parse` | Upload timetable PDF, returns parsed preview (does not commit) |
| POST | `/api/classes/:id/timetable/commit` | Commit reviewed subject rows into `semesterSubjects[currentSemester]` |
| GET | `/api/classes/:id/semester-history` | Retrieve archived subject lists for all past semesters of this class |
| GET | `/api/setup/wizard-state/:classId` | Returns wizard progress — which steps are complete, for resuming setup |

---

## 9. Migration Notes

For classes and students already in the system under the old `academicYear`-based model:

```
1. Create a batch document per existing cohort, inferring startYear/endYear 
   from existing academicYear values
2. Migrate each class's flat subjectAssignments[] into 
   semesterSubjects[currentSemester] with status: "active"
3. Set student.currentSemester from existing semester field — no behavior 
   change for currently active students
4. academicYear field can remain temporarily as a display-only fallback 
   until the batch label fully replaces it in the UI
```

No currently active no-due batches or approval records need to change — this migration only affects the class and student setup layer, not the approval/request/batch execution engine, which remains untouched by this entire feature set.

---

*End of Features Guide v1.0 — No-Due Clearance System, MITS*