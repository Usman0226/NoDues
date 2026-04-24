---
phase: 1
plan: 1
wave: 1
---

# Plan 1.1: Feedback State & UI Consolidation

## Objective
Centralize the feedback system state to ensure a single, consistent experience across the application. Eliminate redundant component instances and state logic.

## Context
- client/src/context/UIContext.jsx
- client/src/App.jsx
- client/src/components/ui/FeedbackButton.jsx
- client/src/components/layout/Sidebar.jsx
- client/src/components/Feedback/FeedbackModal.jsx

## Tasks

<task type="auto">
  <name>Centralize Feedback State in UIContext</name>
  <files>
    - client/src/context/UIContext.jsx
  </files>
  <action>
    Add feedback visibility state and handlers to `UIContext`.
    - Add `isFeedbackOpen` state.
    - Add `openFeedback` and `closeFeedback` callbacks.
    - Export these values in the context provider.
  </action>
  <verify>Check that useUI() returns isFeedbackOpen, openFeedback, and closeFeedback.</verify>
  <done>State is globally available via useUI hook.</done>
</task>

<task type="auto">
  <name>Consolidate FeedbackModal to App Root</name>
  <files>
    - client/src/App.jsx
    - client/src/components/ui/FeedbackButton.jsx
    - client/src/components/layout/Sidebar.jsx
  </files>
  <action>
    Refactor components to use the global feedback state and remove local modal instances.
    - Move `<FeedbackModal />` to the root `AppContent` in `App.jsx`.
    - Update `FeedbackButton.jsx` to remove its local `isOpen` state and use `openFeedback()` from `UIContext`.
    - Update `Sidebar.jsx` to remove its local `FeedbackModal` and use `openFeedback()` from `UIContext`.
    - Update `StudentNavRight` in `App.jsx` to use the global state.
  </action>
  <verify>Verify that clicking the floating button, sidebar link, or nav link all open the same modal and closing one closes all.</verify>
  <done>Exactly one instance of FeedbackModal exists in the DOM tree at any time.</done>
</task>

## Success Criteria
- [ ] No local `useState(false)` for feedback visibility in individual components.
- [ ] Single `FeedbackModal` instance rendered in `App.jsx`.
- [ ] All feedback triggers (Button, Sidebar, Navbar) work consistently.
