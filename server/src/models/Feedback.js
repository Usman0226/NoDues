import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['bug', 'suggestion', 'other'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  submittedBy: {
    userId: mongoose.Schema.Types.ObjectId,
    name: String,
    role: String,
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
    enum: ['open', 'closed'],
    default: 'open'
  }
}, {
  timestamps: true
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

export default Feedback;
