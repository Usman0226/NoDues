import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Subject code is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    semester: {
      type: Number,
      min: 1,
      max: 8,
    },
    isElective: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

import { invalidateEntityCache } from '../utils/cacheHooks.js';

// M0-safe indexes (code unique:true creates its index automatically)
subjectSchema.index({ semester: 1, isElective: 1, isActive: 1 });
subjectSchema.index({ name: 'text' }); // lightweight text search

// ── Cache Invalidation Hooks ────────────────────────────────────────────────
subjectSchema.post('save', async function (doc) {
  invalidateEntityCache('subject', doc._id);
});

subjectSchema.post('findOneAndUpdate', async function (doc) {
  if (doc) invalidateEntityCache('subject', doc._id);
});

export default mongoose.model('Subject', subjectSchema);
