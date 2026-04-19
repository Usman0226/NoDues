import mongoose from 'mongoose';
import { invalidateEntityCache } from '../utils/cacheHooks.js';

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    hodId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Faculty',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

departmentSchema.index({ hodId: 1 });

// ── Cache Invalidation Hooks
departmentSchema.post('save', function(doc) {
  invalidateEntityCache('department', doc._id);
});

departmentSchema.post('findOneAndUpdate', async function() {
  const query = this.getQuery();
  const doc = await this.model.findOne(query);
  if (doc) invalidateEntityCache('department', doc._id);
});

export default mongoose.model('Department', departmentSchema);
