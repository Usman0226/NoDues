import mongoose from 'mongoose';

const nodueApprovalSchema = new mongoose.Schema({
  requestId: {
    type: mongoose.Schema.ObjectId,
    ref: 'NodueRequest',
    required: true
  },
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
  studentRollNo: String,
  studentName: String,
  facultyId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Faculty',
    required: true
  },
  subjectId: mongoose.Schema.ObjectId,
  subjectName: String,
  approvalType: {
    type: String,
    enum: ['subject', 'classTeacher', 'mentor']
  },
  roleTag: {
    type: String,
    enum: ['faculty', 'classTeacher', 'mentor', 'hod']
  },
  action: {
    type: String,
    enum: ['pending', 'approved', 'due_marked'],
    default: 'pending'
  },
  dueType: {
    type: String,
    enum: ['library', 'lab', 'fees', 'attendance', 'other', null]
  },
  remarks: String,
  actionedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Primary compound index for high volume queries
nodueApprovalSchema.index(
  { requestId: 1, facultyId: 1, subjectId: 1, roleTag: 1 },
  { unique: true }
);

export default mongoose.model('NodueApproval', nodueApprovalSchema);
