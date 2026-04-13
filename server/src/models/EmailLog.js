import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema({
  recipient: {
    type: String,
    required: true,
    index: true
  },
  subject: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'faculty', 'admin', 'system'],
    default: 'system'
  },
  status: {
    type: String,
    enum: ['success', 'failure'],
    required: true,
    index: true
  },
  error: {
    message: String,
    code: String,
    stack: String
  },
  accountIndex: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  triggeredBy: {
    type: String,
    default: 'SYSTEM'
  }
}, {
  timestamps: true
});

// Index for date-based lookups (quota calculation)
emailLogSchema.index({ timestamp: 1 });

const EmailLog = mongoose.model('EmailLog', emailLogSchema);

export default EmailLog;
