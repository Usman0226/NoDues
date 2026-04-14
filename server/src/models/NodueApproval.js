import mongoose from 'mongoose';

const nodueApprovalSchema = new mongoose.Schema({
  requestId: {
    type: mongoose.Schema.ObjectId,
    ref: 'NodueRequest',
    required: true
  },
  batchId: {
    type: mongoose.Schema.ObjectId,
    ref: 'NodueBatch',
    required: true
  },
  studentId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Student',
    required: true
  },
  studentRollNo: String,
  studentName: String,
  facultyId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Faculty',
    required: true
  },
  subjectId: mongoose.Schema.ObjectId,
  subjectName: String,
  approvalType: {
    type: String,
    enum: ['subject', 'classTeacher', 'mentor']
  },
  roleTag: {
    type: String,
    enum: ['faculty', 'classTeacher', 'mentor', 'hod']
  },
  action: {
    type: String,
    enum: ['pending', 'approved', 'due_marked'],
    default: 'pending'
  },
  dueType: {
    type: String,
    enum: ['library', 'lab', 'fees', 'attendance', 'other', null]
  },
  remarks: String,
  actionedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Primary compound index — prevent duplicates, cover requestId lookups
nodueApprovalSchema.index(
  { requestId: 1, facultyId: 1, subjectId: 1, roleTag: 1 },
  { unique: true }
);

// Faculty pending list: "all pending approvals for Dr. X in batch Y"
nodueApprovalSchema.index({ batchId: 1, facultyId: 1, action: 1 });

// Admin batch grid: count by action across a batch
nodueApprovalSchema.index({ batchId: 1, action: 1 });

// Student status page — most-hit endpoint at peak load
nodueApprovalSchema.index({ studentId: 1, batchId: 1 });

import { invalidateEntityCache } from '../utils/cacheHooks.js';

// Faculty dashboard: total pending count across all batches
nodueApprovalSchema.index({ facultyId: 1, action: 1 });

// requestId lookup (recalcRequestStatus) — kept minimal for write speed
nodueApprovalSchema.index({ requestId: 1, action: 1 });

// ── Cache Invalidation Hooks ────────────────────────────────────────────────
nodueApprovalSchema.post('save', async function (doc) {
  invalidateEntityCache('approval', doc.facultyId, doc.batchId);
});

nodueApprovalSchema.post('findOneAndUpdate', async function (doc) {
  if (doc) invalidateEntityCache('approval', doc.facultyId, doc.batchId);
});

export default mongoose.model('NodueApproval', nodueApprovalSchema);
