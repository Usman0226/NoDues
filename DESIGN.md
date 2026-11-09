# Admin Portal Design System & Guidelines

This document outlines the core design philosophy, visual tokens, and specific component rules that govern the NoDues Admin Portal. The goal is to maintain a **premium, highly-polished, and tactile** user interface that feels more like a modern high-end SaaS product than a traditional internal tool.

---

## 1. Core Philosophy

*   **Depth & Layering:** Avoid flat, lifeless layouts. Use subtle shadows (`--shadow-premium`), glassmorphism (`backdrop-filter`), and overlapping layers to create a sense of physical depth.
*   **Tactile Interactions:** Every interactive element should respond to the user. Use micro-animations (scale, lift, glow) to make the interface feel alive.
*   **Restrained Borders:** Avoid harsh, solid borders. Use `color-mix` with transparency (e.g., `color-mix(in oklab, var(--muted) 40%, transparent)`) to create soft separation.
*   **High-Fidelity Typography:** Rely on font weight, letter spacing, and distinct typographic scales to establish hierarchy, reducing the reliance on boxes and lines.

---

## 2. Global Tokens & Theming

### Typography
*   **Primary Fonts:** `Geist` (for UI/body text) and `Outfit` (for headings/display).
*   **Hierarchy:**
    *   **Headers (h1-h6):** `Outfit`, weight 800, tight tracking (`-0.02em`).
    *   **Body:** `Geist`, standard tracking, readable line heights.
    *   **Kickers & Labels (`.page-kicker`, `.label-tech`, `.nav-text`):** Small (10px-11px), uppercase, extreme tracking (`0.22em` - `0.28em`), heavy weight (600-800). Used for metadata, table headers, and navigation categories.

### Color Palette
*   **Backgrounds:** Off-white (`#fcfcfd`) with subtle linear gradients to add texture without hurting scroll performance.
*   **Surfaces:** White (`#ffffff`) or glass panels (`rgba(255, 255, 255, 0.7)`).
*   **Brand Colors:** Indigo (`#6366f1` / `#3730a3`) for primary actions, Gold (`#f59e0b`) for active/accent states.
*   **Status Indicators:**
    *   Approved / Cleared: Emerald (`#10b981`)
    *   Pending / Warning: Amber (`#f59e0b`)
    *   Due / Rejected: Red (`#ef4444`)
    *   HOD Override: Indigo (`#6366f1`)

### Dark Mode Strategy
*   **Implementation:** Define a `.dark` class block in the root CSS to swap out variables. 
*   **Depth without Shadows:** In Dark Mode, drop shadows (`--shadow-premium`) are invisible. Instead, rely on surface lightness to convey elevation (e.g., `#121212` for background, `#1e1e1e` for surface panels, `#2c2c2c` for elevated overlays).
*   **Borders:** Use very faint borders (`border-white/10`) to define edges where shadows would traditionally be used.

---

## 3. Component Design Rules

### A. The Sidebar (Navigation)
The sidebar is the anchor of the admin portal. It must feel stable but highly interactive.
*   **Surface:** Use the `.surface-panel` or a deep background color. If light, use a subtle right border to separate it from the main content.
*   **Active States:** An active link should clearly stand out using a combination of a light background fill (e.g., `bg-white/4`), an icon color change (Gold/Indigo), and a subtle drop shadow (`shadow-lg shadow-black/10`).
*   **Hover States:** Unselected links should have a gentle color transition (e.g., text fading from muted to solid) and a very subtle background shift.
*   **Transitions:** Expanding/collapsing sections must be fluid. Use `grid-rows-[1fr]` to `grid-rows-[0fr]` trick or Framer Motion for buttery-smooth height animation. Text inside links should fade and slide (`w-0 opacity-0` to `w-full opacity-100`) when the sidebar collapses.

### B. Data Tables
Tables are the most important functional component of an admin panel. They must be legible, scannable, and clean.
*   **Mobile / Responsive Strategy:** Never force a user to scroll horizontally on a phone for critical data. Below the `md` breakpoint, hide the native `<table>` and render the rows as a vertical stack of **Cards**. Map the column headers to inline labels next to the data.
*   **Container (Desktop):** Wrap tables in a `.premium-card` with an overflow-x-auto container.
*   **Header Row (`<th>`):**
    *   Use the `.label-tech` or `.nav-text` typographic style (small, uppercase, wide letter-spacing, muted color).
    *   Make headers sticky with a glassmorphism effect (`backdrop-blur-md bg-white/70`) so they remain visible and legible during vertical scrolls.
    *   No vertical borders between columns.
*   **Data Rows (`<tr>`):**
    *   **Hover Effect:** Apply a very subtle background color on row hover (e.g., `hover:bg-indigo-50/50` or `hover:bg-slate-50/50`) to help the user's eye track across wide datasets.
    *   **Borders:** Only use soft bottom borders (`border-b border-muted/30`) between rows. Remove the border on the last row.
*   **Cell Content (`<td>`):**
    *   Align numbers (amounts, counts) to the right. Align text to the left.
    *   Use **Status Badges/Pills** for states (Pending, Approved). Badges should have a soft background (e.g., `bg-emerald-100`) and a bold, darker text color (`text-emerald-700`) with a very subtle ring (`ring-1 ring-emerald-500/20`).
*   **Pagination:** Keep it minimalistic. Use clean icon buttons (Lucide icons) for Next/Prev, with the current page highlighted in a solid primary color.
*   **Bulk Actions & Floating Action Bar (The "Secret Sauce"):** When users need to manage hundreds of records, forcing them to click an "Approve" button row by row is terrible UX. 
    *   Include a checkbox in the first column of each row.
    *   When one or more rows are selected, animate a **Floating Action Bar** into view at the bottom-center of the screen. 
    *   This bar should sit above the content (`z-50`, `--shadow-premium`), display the count of selected items ("3 selected"), and offer bulk action buttons ("Approve All", "Reject All").

### C. Cards & Containers (Dashboards)
*   **Styling:** Use `.premium-card`. They should have a white/glass background, a soft mix border, and `--shadow-md`.
*   **Interactions:** If a card is clickable (e.g., a summary metric card), apply the `.hover-lift` class so it floats upward (`translateY(-2px)`) and the shadow deepens on hover.
*   **Internal Layout:** Use ample padding (e.g., `p-6`). Separate the card header (title + optional icon/action) from the body content.

### D. Buttons & Actions
*   **Primary Buttons:** Solid background (`bg-primary`), white text. Apply `.hover-lift` or a slight scale effect (`active:scale-95`). Add `.animate-sweep` for high-conversion buttons (like "Submit Dues").
*   **Secondary/Ghost Buttons:** Transparent background with a subtle hover fill (`hover:bg-muted/20`) and text color matching the primary or text color.
*   **Destructive Buttons:** Use standard red/rose tones but keep the styling elegant (avoid overly harsh gradients).

### E. Forms & Inputs
*   **Inputs/Selects/Textareas:**
    *   Background: White or very light gray (`#f8fafc`).
    *   Borders: Subtle default border (`border-muted`).
    *   Focus State: This is critical. On focus, replace the border with a distinct ring using the primary brand color (e.g., `focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500`).
    *   Typography: Keep input text at a readable size (`16px` minimum to prevent iOS zoom).
*   **Labels:** Small, semi-bold, slightly muted color above the input.

---

## 4. Animation & Motion Guidelines

*   **Rule of Thumb:** Animations should be fast and purposeful. They should never slow down the user.
*   **Easings:** Always use custom cubic-bezier curves like `var(--ease-lux)` rather than standard `ease-in-out` to give a premium, snappy feel.
*   **Page Transitions:** Use Framer Motion (`<AnimatePresence>`) to fade and slightly slide (`.fade-up`) pages in when navigating.
*   **Loading States:** Prefer Skeleton loaders that match the exact shape of the incoming data over generic spinning wheels. Use `.animate-pulse` or a custom shimmer effect on the skeletons.

---

## 5. UX (User Experience) & Interaction Principles

A beautiful UI must be matched with a completely frictionless, invisible UX. The admin portal should anticipate user needs, forgive mistakes, and make dense data manipulation feel effortless.

### A. System Feedback & State Management
*   **Optimistic UI:** When a user performs a state-changing action (e.g., approving dues, saving a setting, toggling a status), the UI must update **instantly**. Do not wait for the network request to resolve before showing the new state. If the API call eventually fails, revert the state and show an error toast. This makes the app feel native and lightning-fast.
*   **Toast Notifications & Snackbars:** Use non-intrusive toasts (e.g., `react-hot-toast`) for transient feedback. 
    *   **Success:** Keep it brief ("Settings saved"). Auto-dismiss after 3s.
    *   **Error:** Provide actionable feedback ("Failed to save settings. Please check your network connection."). Do not auto-dismiss critical errors without user interaction.
    *   **Placement:** Bottom-right or top-center to avoid obscuring primary navigation or page headers.
*   **Empty States & Onboarding:** Never show a blank table, list, or dashboard widget. An empty state is an opportunity to guide the user. It must contain:
    *   An illustrative icon or subtle graphic (e.g., Lucide's `Inbox`, `FileX` with a soft primary-color background pill).
    *   A concise, friendly heading ("No pending approvals").
    *   Helpful subtext ("You're all caught up for today. New requests will appear here.").
    *   A primary Call-to-Action (CTA) if applicable ("+ Add new record").
*   **Destructive Actions (Delete/Reject):** Always require confirmation for destructive actions, but do it smartly. Avoid blocking native `alert()` dialogs. Use inline confirmations, slide-out panels, or a well-designed modal with the primary button focused on "Cancel" by default to prevent accidental data loss. For non-critical deletions, provide a 5-second "Undo" toast instead of an annoying confirmation modal.

### B. Loading, Skeleton & Perceived Performance
*   **Skeleton Loaders over Spinners:** Avoid full-page spinners (they cause cognitive friction and "wait-time anxiety"). Instead, use skeleton screens that map exactly to the layout of the incoming data (e.g., a skeleton table row, a skeleton card header). Add a subtle `.animate-pulse` or shimmer gradient to indicate activity.
*   **Progressive Disclosure & Lazy Loading:** For data-dense dashboards, load the critical path data (e.g., summary stats) first. Defer rendering heavy charts or complex data tables below the fold until the user scrolls, or hide advanced settings behind an "Advanced Options" toggle.
*   **Button Loading States:** When a user clicks a submit button, immediately disable the button to prevent double-submissions. Maintain its original width to prevent layout shift, and replace the label/icon with a subtle loading indicator (like a fading dots animation or a tiny spinner next to the text).

### C. Forms, Inputs & Data Entry
*   **Inline Contextual Validation:** Validate forms dynamically on `blur` or `onChange` (after the user has interacted with the field). Do not wait until `onSubmit` to yell at the user with a giant error box at the top of the form. 
    *   Display a soft red text immediately below the input field detailing exactly what went wrong.
    *   Turn the input's focus ring red (`focus:ring-red-500/50`).
*   **Smart Defaults & Auto-formatting:** 
    *   Format data visually as the user types (e.g., auto-spacing phone numbers, currency, or roll numbers).
    *   Provide smart default selections in dropdowns where 80% of users choose the same option.
*   **Keyboard Navigation & Accessibility (a11y):** 
    *   Forms must be fully navigable via the `Tab` key in a logical order.
    *   When a modal or drawer opens, trap the focus inside it. Pressing `Escape` must close the modal.
*   **Avoid Reset Buttons:** Do not place a "Clear" or "Reset Form" button next to "Submit." Users frequently accidentally click them and lose their work, leading to massive frustration.

### D. Navigation Flow & Context Preservation
*   **Contextual Overlays (Drawers & Modals):** When editing a specific entity (like a Student profile or a Due record) from a master table, **do NOT navigate the user to a completely new page route** if it breaks their flow. Use a right-side sliding Drawer or a centered Modal. This keeps the user anchored to the master list in the background, making it extremely fast to edit multiple rows sequentially without hitting the "Back" button.
*   **Breadcrumbs:** For deeply nested hierarchical views (e.g., `Dashboard > Batches > 2024 Batch > Student Profile`), always render clear, clickable breadcrumbs at the top of the page. This prevents the user from feeling "lost" and provides an instant escape hatch to a higher level.
*   **Sticky Context:** When scrolling down a massive data table, the Table Header (`<th>`) and the master Page Header (containing the title and primary actions like "Export" or "Add") must remain sticky (`sticky top-0 z-10`). The user should never have to scroll back to the top to remember what column they are looking at or to perform a primary page action.

### E. Power-User UX & Global Search
*   **Global Command Palette (`Cmd + K`):** Implement a global search overlay that intercepts the `Cmd+K` / `Ctrl+K` keyboard shortcut. 
    *   This is the hallmark of a premium SaaS product (e.g., Linear, Vercel). 
    *   Power users should be able to press `Cmd+K`, type "John Doe" or "Settings", and instantly navigate there without taking their hands off the keyboard.
    *   The palette should support navigating to deeply nested routes, triggering common actions ("Create Batch"), and searching primary entities (Students, Faculty).

---

## 6. Summary Checklist for New Components
1. [ ] Is the typography hierarchy clear without relying on bold colors?
2. [ ] Are borders soft and transparent rather than harsh and solid?
3. [ ] Does the component have a tactile hover/active state?
4. [ ] If it floats or overlays, does it have an appropriate shadow and backdrop blur?
5. [ ] Is the contrast sufficient for readability (especially in badges and kickers)?


## 6. Multi-Step Flows & Progressive Disclosure

This is the direct answer to the pattern you described — and it has a name and well-established prior art (Typeform, Linear's onboarding, Stripe Checkout, Apple's Setup Assistant). It governs the Class Setup Wizard directly, and should be the default treatment for *any* flow in this portal with more than one logical step (batch initiation, timetable review-and-commit, student bulk-import confirmation).

### The Core Principle

**Never show the whole form at once. Show one meaningful unit of work at a time, and let completing it be the thing that reveals the next one.** A long scrolling form with 20 fields visible simultaneously is not "efficient" — it's a wall of cognitive load the user has to self-sequence. A well-designed wizard does the sequencing *for* them.

### What This Looks Like, Structurally

```
┌─────────────────────────────────────────┐
│  ● ─── ● ─── ○ ─── ○ ─── ○   Step 2 of 5 │  ← progress indicator, always visible
├─────────────────────────────────────────┤
│                                           │
│   ✓ Step 1 — Class Info          [Edit]  │  ← completed steps COLLAPSE
│     CSD-A · Batch 2024-2028               │     into a compact summary row,
│                                           │     not left expanded and scrolled past
│   ┌─────────────────────────────────┐   │
│   │  Step 2 — Upload Timetable       │   │  ← current step is the ONLY
│   │                                   │   │     fully-expanded, focused unit
│   │  [ Drop PDF here ]                │   │
│   │                                   │   │
│   │              [ Continue → ]       │   │
│   └─────────────────────────────────┘   │
│                                           │
│   Step 3 — Import Students   (locked)    │  ← future steps shown as a
│   Step 4 — Assign Mentors    (locked)    │     QUIET, inert placeholder —
│   Step 5 — Initiate Batch    (locked)    │     visible as a map of what's
│                                           │     ahead, but not interactive
└─────────────────────────────────────────┘
```

### The Behavioral Rules

- **Only one step is ever fully interactive at a time.** Earlier steps collapse to a one-line summary with an "Edit" affordance. Later steps are visible (so the user has a mental map of the whole journey) but visually inert — reduced emphasis, no inputs rendered yet, clearly not-yet-actionable.
- **Transitioning between steps is a single, orchestrated motion** — the completing step collapses (height + opacity, not a hard cut), and the next step expands into the space it leaves, in one continuous motion the eye can follow. This is the one place in this entire guide where more elaborate motion is justified — it's the "spend your boldness in one place" moment for this portal (see Part 1 Section 4). Elsewhere, keep motion restrained; here is where it earns its keep.
- **Completed steps are editable without restarting the flow.** Clicking "Edit" on a collapsed step re-expands it in place, pushes later steps back into their locked state temporarily, and on save, re-collapses and resumes forward — never a destructive "start over."
- **Validation gates the transition, not the field.** The "Continue" action is disabled (not hidden) until the current step's requirements are met, with the reason surfaced inline (Section 8 — Forms, below) — the user is never allowed to advance into a broken next step.
- **The progress indicator states position, not just visual dots.** "Step 2 of 5" as text, not only abstract dots — dots alone are a common tell of unfinished UX (fine for 3 steps, ambiguous for anything longer).
- **Resuming a flow drops the user exactly where they left off**, with every earlier step already shown collapsed-and-complete — never an empty flow that makes them re-enter what they already gave.

### Where NOT to Use This Pattern

Progressive disclosure is wrong for anything the user needs to **scan and compare at once** — an approval list, a data table, a dashboard. It's specifically for **linear, sequential construction tasks** where each step depends on committing the previous one. Using it for something like the batch status grid (which needs to be scannable as a whole) would be a misapplication of the pattern.

---

## 7. Information Hierarchy & Scannable Density

Admin portals live and die by how fast a person can locate the one thing they're looking for in a screen full of things.

### The Three-Tier Reading Order

Every screen with data should resolve into three visual tiers the eye can parse without reading every word:

```
TIER 1 — Status at a glance       (badges, counts, color-independent icons)
TIER 2 — Primary identifier        (name, roll no, class — what IS this row)
TIER 3 — Supporting detail         (timestamps, secondary metadata)
```

A row or card that gives all three tiers equal visual weight forces the user to read everything to find anything. Tier 1 should be identifiable in peripheral vision — shape and position, not just color — because color alone is also an accessibility failure (see Section 15).

### Density Modes

For a portal that serves both occasional users (a faculty member checking pending approvals twice a semester) and power users (an admin managing hundreds of rows daily), offer a **Comfortable / Compact** density toggle on data-heavy views — a pattern standard in Notion, Linear, and Airtable:

- **Comfortable** — generous row height, used by default, optimized for a faculty member scanning a short list
- **Compact** — tighter row height, more rows visible without scrolling, remembered as a per-user preference, for an admin working through hundreds of records

This is a structural toggle, not a cosmetic one — compact mode should genuinely fit more real information per screen, not just shrink padding.

---

## 8. Forms as a System, Not Isolated Fields

Part 1 covers individual input styling. This section covers how a *collection* of inputs should behave as a group.

### Grouped Fields, Not a Flat List

Related fields belong inside a visually distinct group with a short label describing what the group is *for* ("Contact Details," not individually unlabeled Email/Phone fields floating in sequence). A form with 12 ungrouped fields in a single column reads as a chore; the same 12 fields organized into 3 named groups of 4 reads as organized work.

### Inline Help, Not Tooltip Archaeology

If a field needs explanation, the explanation lives directly beneath the label, always visible, in reduced-emphasis text — never hidden behind a hover-triggered tooltip the user has to discover. Tooltips are acceptable only for genuinely secondary, rarely-needed detail — never for anything required to complete the field correctly.

### The Save/Discard Decision Should Be Impossible to Lose Track Of

If a form has unsaved changes and the user tries to navigate away, surface this *before* they lose the work — not as a jarring native browser dialog, but as the same inline confirmation pattern used for destructive actions elsewhere in this system (Part 1, Section 5-A). The exact wording should state what will be lost, not just "are you sure."

---

## 9. Role-Aware & Permission-Aware UI

NDS has four distinct roles (Admin, HoD, Faculty, Student) with meaningfully different capabilities on otherwise-similar screens. This needs a deliberate visual language, not ad-hoc hiding of buttons.

### Three Distinct States for "Can't Do This Right Now"

| State | When | Treatment |
|---|---|---|
| **Not permitted** | A faculty member viewing a screen only Admin can act on | The control is **not rendered at all** — don't show a disabled button for something the user categorically cannot do; its absence is the clearest signal |
| **Not yet available** | HoD trying to override before a batch has any `has_dues` requests | The control **is rendered, visibly disabled**, with a one-line reason shown on hover/focus — because this is a temporary, resolvable condition the user should know exists |
| **Locked by sequence** | Step 4 of the Setup Wizard before Step 3 is complete | Rendered with explicit **reduced visual weight** (Section 6) — the user can see what's coming but it reads as clearly not-yet-theirs to touch |

Conflating these three into a single generic "greyed out" treatment is a common failure — the user can't tell *why* something is unavailable, which turns a legitimate restriction into a confusing dead end.

### Department Scoping Should Be Visually Obvious, Not Implicit

An HoD viewing data is implicitly scoped to their department by the backend (per the API Design Guide's `deptScope` middleware) — the UI should make this scoping **visible**, not silent. A small, persistent indicator of "you're viewing: CSE" near the page header prevents the HoD from ever wondering whether they're seeing the whole picture or a filtered one.

---

## 10. Real-Time & Live-Updating Data

NDS pushes live updates via SSE — approvals changing status while an admin is looking at the batch grid, for instance. This needs explicit UX treatment or it reads as the screen randomly changing underneath the user.

### Never Silently Re-Render What the User Is Looking At

When an SSE event updates a row currently visible on screen, the change must be **announced visually**, briefly — a momentary highlight flash on the affected row or cell (a brief background pulse that fades, not a jarring color swap) — so the user's eye is drawn to *what just changed* rather than discovering the data is different on their next glance and wondering if they misread it the first time.

### Never Reflow Content the User Is Actively Reading

If an update would change a row's position (e.g., re-sorting as statuses change), **defer the reflow** — keep the row in place with its updated content and flash, and only let it move to its new sorted position on the user's next explicit action (a manual refresh, a re-sort click) or after a brief grace period once the user's cursor/focus has moved away. A table that silently reorders itself while someone is mid-click is one of the most disorienting experiences in data-dense UI.

### A Visible, Ambient "Live" Indicator

A small, persistent, unobtrusive indicator (not a notification, not a toast) communicates that the screen is live-connected — so the absence of manual refreshing reads as "this is current," not "this might be stale."

---

## 11. Command Palette for Power Users

Admins and HoDs will perform the same handful of actions repeatedly, often many times in one sitting (navigate to a class, initiate a batch, search a student). A **command palette** (industry standard: Linear, Raycast, Notion, GitHub — invoked by a keyboard shortcut) should sit above the navigation hierarchy as a universal shortcut:

- Invoked by a single, consistent keyboard shortcut from anywhere in the portal
- Fuzzy-searches across classes, students (by roll number), faculty, and direct navigation targets (e.g., typing "batch" surfaces "Initiate No-Due Batch" as an executable action, not just a page link)
- Recently-visited and recently-acted-on items surface first when the palette opens empty, before the user types anything

This is specifically a power-user feature — it should never be the *only* way to reach something, but for the people living in this portal daily, it is what separates "fast tool" from "tool you tolerate."

---

## 12. Notifications & Activity Feed

### In-App Notification Center, Separate From Toasts

Toasts (Part 1, Section 5-A) are for immediate feedback on the action the user just took. A separate, persistent **notification center** (a bell icon with a count) is for things that happened *without* the user's direct action — a faculty marking a due on one of an HoD's students, a new comment on a flagged clearance. These are structurally different categories of information and should never share one mechanism — a toast that appeared and vanished while the user wasn't looking is information lost forever; a notification center entry persists until acknowledged.

### Activity Feed Entries Read Like Sentences, Not Logs

An entry should read as a complete, specific sentence a human wrote — "Dr. Sharma approved DBMS for 21CSE001" — not a terse machine log fragment ("APPROVAL_UPDATED: req_8821"). This directly follows the writing principles already established in Part 1 — plain language, specific, no system internals leaking into user-facing text.

---

## 13. Search & Filtering as a First-Class Pattern

Any list beyond roughly 20 items needs search and filter, not just pagination.

- **Search input is always visible**, not hidden behind an icon the user must click to reveal — for a roll-number lookup that will happen dozens of times a day, every extra click compounds.
- **Filters are shown as active, removable pills/tags** below or beside the search bar once applied — "Semester: 5 ✕", "Status: Has Dues ✕" — so the user can see at a glance exactly what view they're in and remove one constraint without resetting everything.
- **Filtered-and-empty is a distinct empty state** from genuinely-empty (Part 1, Section 5-A) — "No students match these filters" with a "Clear filters" action is a different message, and a different recovery path, than "No students in this class yet."

---

## 14. Deciding Between Drawer, Modal, and Full Page

Part 1 already states "use a drawer, don't navigate away" — this section gives the actual decision framework, since not everything should be a drawer either.

| Use | When |
|---|---|
| **Inline expansion** (row expands in place) | Viewing a small amount of additional detail on one row without leaving the table context at all — e.g., expanding a student row to see their 8 approval lines |
| **Drawer (slide-in from side)** | Editing or acting on one entity while keeping the list behind it visible and anchored — editing a student's mentor assignment, reviewing one clearance item submission |
| **Modal (centered overlay)** | A short, focused decision that blocks everything else until resolved — a destructive confirmation, the HoD override remark entry |
| **Full page navigation** | The task is substantial enough to deserve its own context and the user is not expected to return to the originating list immediately — the Setup Wizard itself, a dedicated report view |

Choosing the wrong one of these is a common source of a portal feeling clunky — a full-page navigation for a two-field edit feels heavy; a modal for a ten-field form feels cramped; a drawer for something that needs the user's full attention (an irreversible override) can feel too casual for the weight of the action.

---

## 15. Accessibility as Structural, Not Decorative

These are treated as part of the structural quality bar, not a separate compliance checklist bolted on afterward.

- **Never communicate state through color alone.** Every status badge pairs its color with a shape, icon, or label — someone with color blindness must be able to distinguish "Cleared" from "Has Dues" without relying on hue.
- **Every interactive element has a visible focus state**, distinct from hover — keyboard-only navigation (Part 1, Section 5-C) is meaningless if focus is invisible.
- **Motion respects reduced-motion preference** — every transition in Section 6, 10, and elsewhere degrades gracefully to an instant state change for users who've indicated they want reduced motion, rather than forcing animation on everyone.
- **Touch targets on mobile meet a minimum comfortable size** — a row's checkbox, a card's action button, must be reliably tappable without precision aiming, especially for the student-facing mobile views which will be used far more casually than the admin desktop views.

---

## 16. The Restraint Checklist — Applying Part 1's Principle Systemically

Part 1 says "spend your boldness in one place." Applied at the level of a whole portal rather than a single page, this means:

- **One flow gets the elaborate choreographed transition** (the Setup Wizard, Section 6) — not every drawer open, every tab switch, every card hover.
- **One element per screen earns genuine visual emphasis** — not every card a `hover-lift`, not every button a sweep animation. If everything is emphasized, nothing is.
- **Skeleton loaders, optimistic UI, and toasts are the invisible baseline everywhere** (Part 1, Section 5) — reliable and consistent, not something to be creative with per-screen.

A portal that follows this restraint at the systemic level — rather than maximizing polish independently on every individual page — is what actually produces the coherent, premium feel the brief is asking for. Inconsistent boldness across screens reads as assembled-from-templates even when each individual screen is well executed.

---

*End of Part 2. Read alongside Part 1 (Sections 1–5) as one continuous design system — Part 1 governs appearance, Part 2 governs sequencing and behavior.*