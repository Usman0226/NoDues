import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['import_students', 'import_faculty', 'import_electives', 'import_mentors', 'bulk_email', 'sync', 'batch_initiation']
  },
  label: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['processing', 'success', 'error'],
    default: 'processing'
  },
  message: String,
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true
  },
  meta: {
    requested: Number,
    success: Number,
    failed: Number,
    errors: [String]
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) // Auto-prune after 48h
  }
}, {
  timestamps: true
});

// Index for auto-pruning
taskSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Index for user lookup
taskSchema.index({ actor: 1, createdAt: -1 });

const Task = mongoose.model('Task', taskSchema);

export default Task;
