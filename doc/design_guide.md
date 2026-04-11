# ARC Style Guide: Judging & Stats Ecosystem
This document defines the visual and interaction standards for the D'FESTA 2K26 Judging, Stats, and Administrative portals. It ensures a consistent, premium, and "high-authority terminal" aesthetic across all management interfaces.
---
## 1. Core Identity & Atmosphere
The management ecosystem is designed as an **"Institutional Command Center"**. It prioritizes data clarity, authority, and futuristic minimalism.
- **Vibe**: Technical, Authoritative, Clean, Industrial.
- **Key Traits**: High contrast, heavy tracking on labels, uppercase focus, and "elastic" physical motion.
---
## 2. Design Tokens
### 2.1 Color Palette
The system uses a neutral grayscale base with a single powerful accent color (**Indigo**) and specific semantic status colors.
| Token | Light Mode | Dark Mode | Usage |
| :--- | :--- | :--- | :--- |
| **Primary (Brand)** | `#6366f1` (Indigo-600) | `#818cf8` (Indigo-400) | Brand marks, active states, key CTAs. |
| **Accent (Gold)** | `#f59e0b` (Amber-500) | `#f59e0b` (Amber-500) | Revenue, secondary highlights, warning states. |
| **Background** | `#fcfcfd` | `#09090b` (Zinc-950) | Main canvas. |
| **Surface** | `#ffffff` | `#18181b` (Zinc-900) | Cards, modals, sidebars. |
| **Foreground** | `#0a0a0a` (Zinc-950) | `#fafafa` (Zinc-50) | Primary text. |
| **Subtle Text** | `#a1a1aa` (Zinc-400) | `#52525b` (Zinc-600) | Labels, placeholders, timestamps. |
#### Semantic Status
- **Success (Settled)**: `Emerald-500` (#10b981) - Used for paid registrations and completed tasks.
- **Warning (Active)**: `Amber-500` (#f59e0b) - Used for revenue and pending status.
- **Error (Fault)**: `Red-500` (#ef4444) - Used for schedule conflicts and sync failures.
---
### 2.2 Typography
We use a high-contrast typographic system that separates "data" from "instruction".
| Component | Font Family | Size / Weight | Style |
| :--- | :--- | :--- | :--- |
| **Portals Titles** | `Outfit` / `Geist` | `text-4xl++` / `font-black` | `uppercase`, `tracking-tighter` |
| **Section Labels** | `Geist Sans` | `text-[10px]` / `font-black` | `uppercase`, `tracking-[0.4em]` |
| **Data Values** | `Geist Sans` | `tabular-nums` / `font-black` | Large scale, high contrast |
| **Body Text** | `Geist Sans` | `text-sm` / `font-bold` | Clean, high readability |
| **Code/IDs** | `Geist Mono` | `text-[9px]` | `uppercase`, mono-spaced |
---
## 3. Component Architecture
### 3.1 Surfaces (The "Container" Rule)
All surfaces must feel like discrete nodes of a larger system.
- **Border Radius**: Large and aggressive. `rounded-[2.5rem]` for main cards, `rounded-[4rem]` for section wrappers.
- **Borders**: Thin, high-precision borders. `border-zinc-200/60` (Light) or `border-zinc-900` (Dark).
- **Shadows**: Soft, multi-layered "diffusion" shadows.
- **Effect**: Use `backdrop-blur-xl` on mobile headers and floating navs.
### 3.2 Navigation & Headers
- **Sticky Matrix**: Headers should stay fixed with a high-fidelity blur.
- **Search Bar**: Centered, rounded (`rounded-[2rem]`), using `Search` icon with active transition to indigo.
- **Status Pills**: Small, `rounded-full` pills with `5%` opacity backgrounds for metadata (e.g., "Protocol Active", "EX", "IN").
### 3.3 Tables (High-Fidelity)
Data tables should not look like spreadsheets.
- **Headers**: Uppercase, tracking-widest, background `Zinc-50`.
- **Rows**: Large padding (`py-6`), clean row separation (`divide-zinc-50`).
- **Interaction**: Row hover should tint the background and shift text color slightly towards Indigo.
---
## 4. Interaction & Motion
### 4.1 Framer Motion Standards
The app must feel responsive and "alive".
- **Entry**: Use staggered fade-in + slide-up for lists (`duration: 0.8, ease: [0.16, 1, 0.3, 1]`).
- **Transitions**: Enable `LayoutGroup` for smooth card expansion and reordering.
- **Hover Highlights**: Subtle scaling (`scale: 1.01`) or translation (`translate-x-1`) on interactable nodes.
---
## 5. Copywriting & Tone
Avoid "user-friendly" fluff. Use **"Technical Authority"** language.
| Common Term | D'FESTA Terminology |
| :--- | :--- |
| Loading | Hydrating Protocol / Syncing Telemetry |
| Completed | Matrix Imprinted / Settled |
| Success | Protocol Verified |
| Error | Protocol Conflict / Sync Failure |
| Dashboard | Engagement Portfolio / Identity Matrix |
| User Profile | Institutional Node |
---
## 6. Layout Strategy
1. **Responsive Gaps**: Use `gap-5 sm:gap-8` for grids.
2. **Padding**: Never let content touch the edges. Min padding `p-6` on mobile, `p-10+` on desktop.
3. **Empty States**: Use large, centered icons (`0.02` opacity) with specialized technical sub-labels.
---
*Maintained by the ARC UI Engineering Team.*