import mongoose from 'mongoose';

const subjectAssignmentSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Subject',
      required: true,
    },
    subjectName: { type: String, trim: true },
    subjectCode: { type: String, trim: true }, // different department wise 
    isElective:  { type: Boolean, default: false },
    facultyId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Faculty',
      default: null,
    },
    facultyName: { type: String, trim: true, default: null },
  },
  { _id: true }
);

const classSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Class name is required'],
      trim: true,
    },
    departmentId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
    },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: 1,
      max: 8,
    },
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      trim: true,
    },
    classTeacherId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Faculty',
      default: null,
    },
    subjectAssignments: {
      type: [subjectAssignmentSchema],
      default: [],
    },
    studentIds: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'Student',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// M0-safe indexes
classSchema.index({ departmentId: 1, isActive: 1 });
classSchema.index({ departmentId: 1, semester: 1, academicYear: 1 });
classSchema.index({ classTeacherId: 1 });

export default mongoose.model('Class', classSchema);
