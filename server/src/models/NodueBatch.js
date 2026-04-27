import mongoose from 'mongoose';

const nodueBatchSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Class',
    required: true
  },
  className: String, // Denormalized for speed
  departmentId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Department',
    required: true
  },
  semester: Number,
  academicYear: String,
  initiatedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'Faculty' // Usually HoD
  },
  initiatedByRole: {
    type: String,
    enum: ['admin', 'hod', 'ao']
  },
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  deadline: Date,
  status: {
    type: String,
    enum: ['active', 'closed'],
    default: 'active'
  },
  totalStudents: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

import { invalidateEntityCache } from '../utils/cacheHooks.js';

// Optimization & Safety indexes
// Ensures only ONE active batch can exist per class at a time (Distributed Lock)
nodueBatchSchema.index({ classId: 1, status: 1 }, { 
  unique: true, 
  partialFilterExpression: { status: 'active' } 
});
nodueBatchSchema.index({ departmentId: 1, status: 1 });
nodueBatchSchema.index({ status: 1 });

// ── Cache Invalidation Hooks ────────────────────────────────────────────────
nodueBatchSchema.post('save', async function (doc) {
  invalidateEntityCache('batch', doc._id, doc.departmentId);
});

nodueBatchSchema.post('findOneAndUpdate', async function (doc) {
  if (doc) invalidateEntityCache('batch', doc._id, doc.departmentId);
});

export default mongoose.model('NodueBatch', nodueBatchSchema);
