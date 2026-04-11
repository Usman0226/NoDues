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
  facultySnapshot: [
    {
      facultyId: mongoose.Schema.ObjectId,
      facultyName: String,
      subjectId: mongoose.Schema.ObjectId,
      subjectName: String,
      subjectCode: String,
      roleTag: {
        type: String,
        enum: ['faculty', 'classTeacher', 'mentor', 'hod']
      },
      approvalType: {
        type: String,
        enum: ['subject', 'classTeacher', 'mentor']
      }
    }
  ],
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

export default mongoose.model('NodueRequest', nodueRequestSchema);
