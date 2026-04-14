import mongoose from 'mongoose';

const nodueRequestSchema = new mongoose.Schema({
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
  studentSnapshot: {
    rollNo: String,
    name: String,
    departmentName: String
  },
  facultySnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['pending', 'cleared', 'has_dues', 'hod_override'],
    default: 'pending'
  },
  overriddenBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'Faculty'
  },
  overrideRemark: String,
  overriddenAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

import { invalidateEntityCache } from '../utils/cacheHooks.js';

nodueRequestSchema.index({ batchId: 1, status: 1 });
nodueRequestSchema.index({ studentId: 1 });
nodueRequestSchema.index({ batchId: 1, studentId: 1 });

// ── Cache Invalidation Hooks ────────────────────────────────────────────────
nodueRequestSchema.post('save', async function (doc) {
  invalidateEntityCache('request', doc._id, doc.studentId);
});

nodueRequestSchema.post('findOneAndUpdate', async function (doc) {
  if (doc) invalidateEntityCache('request', doc._id, doc.studentId);
});

export default mongoose.model('NodueRequest', nodueRequestSchema);
