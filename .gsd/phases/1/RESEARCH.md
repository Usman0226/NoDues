# Research: Phase 1 - Feedback & Rating System

> **Date**: 2026-04-22
> **Focus**: Premium Feedback UX, React 19 patterns, and Express 5 API design.

## UI/UX Strategy
- **Animated Stars**: Use `framer-motion` for micro-animations (`whileHover`, `whileTap`).
- **State Management**: Use React 19's `useActionState` (formerly `useFormState`) for handling the feedback form submission, ensuring smooth loading and error feedback.
- **Accessibility**: Use `role="radiogroup"` for the star rating to ensure screen reader compatibility.
- **Triggers**:
  - **Implicit**: Subtle "Give Feedback" link in the footer or sidebar.
  - **Explicit**: Post-success prompt (e.g., after a clearance is initiated or approved).

## Backend Implementation (Express 5)
- **Schema**:
  ```javascript
  {
    user: { type: ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['student', 'faculty', 'admin'], required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxLength: 500 },
    category: { type: String, enum: ['ui', 'speed', 'bugs', 'general'], default: 'general' },
    createdAt: { type: Date, default: Date.now }
  }
  ```
- **Controller**: Use the unified `asyncHandler` pattern. Ensure `zod` validation is applied to the incoming payload.

## Role-Based Personalization
- **Student Prompt**: "How was your clearance tracking experience today?"
- **Faculty Prompt**: "Is the approval workflow smooth for you? We'd love your feedback."
- **Admin Review**: Implement a secure GET endpoint restricted to `admin` role.

## Technology Choices
- **Frontend**: Framer Motion, Tailwind 4, React Hot Toast.
- **Backend**: Express 5, Mongoose 9, Zod.
