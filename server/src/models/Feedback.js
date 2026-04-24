import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  rating: {
    type: Number,
    required: [true, 'Please provide a rating'],
    min: 1,
    max: 5
  },
  category: {
    type: String,
    enum: ['ui', 'speed', 'bugs', 'general', 'feature_request'],
    default: 'general'
  },
  description: {
    type: String,
    maxLength: [1000, 'Description cannot exceed 1000 characters']
  },
  submittedBy: {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'submittedBy.roleModel',
      required: true
    },
    roleModel: {
      type: String,
      required: true,
      enum: ['Student', 'Faculty', 'Admin']
    },
    name: String,
    role: String, // student, faculty, admin (lowercase for logic)
    identifier: String // RollNo or Email
  },
  page: {
    type: String,
    required: true
  },
  userAgent: {
    type: String
  },
  status: {
    type: String,
    enum: ['open', 'in-review', 'closed'],
    default: 'open'
  }
}, {
  timestamps: true
});

feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ 'submittedBy.user': 1 });

const Feedback = mongoose.model('Feedback', feedbackSchema);

export default Feedback;
