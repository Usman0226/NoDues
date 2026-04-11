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
    enum: ['admin', 'hod']
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

// Optimization indexes
nodueBatchSchema.index({ classId: 1, status: 1 });
nodueBatchSchema.index({ departmentId: 1, status: 1 });
nodueBatchSchema.index({ status: 1 });

export default mongoose.model('NodueBatch', nodueBatchSchema);
