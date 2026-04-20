import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'userModel',
    required: true
  },
  userModel: {
    type: String,
    required: true,
    enum: ['Admin', 'Faculty', 'Student']
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error', 'approval', 'due'],
    default: 'info'
  },
  link: {
    type: String
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30 // Auto-delete after 30 days
  }
}, {
  timestamps: true
});

// Index for faster queries
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
