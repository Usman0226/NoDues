import mongoose from 'mongoose';

const electiveSubjectSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Subject',
      required: true,
    },
    subjectName: { type: String, trim: true },
    subjectCode: { type: String, trim: true },
    facultyId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Faculty',
    },
    facultyName: { type: String, trim: true },
  },
  { _id: true }
);

const studentSchema = new mongoose.Schema(
  {
    rollNo: {
      type: String,
      required: [true, 'Roll number is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email',
      ],
    },
    classId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
    },
    departmentId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
    },
    semester: {
      type: Number,
      min: 1,
      max: 8,
    },
    academicYear: {
      type: String,
      trim: true,
    },
    yearOfStudy: {
      type: Number,
      min: 1,
      max: 4,
    },
    mentorId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Faculty',
      default: null,
    },
    electiveSubjects: {
      type: [electiveSubjectSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    role: {
      type: String,
      enum: ['student'],
      default: 'student',
    },
  },
  {
    timestamps: true,
  }
);

// Student login — hits on every student session start
studentSchema.index({ rollNo: 1 }, { unique: true });

// Class student list — admin class page
studentSchema.index({ classId: 1, isActive: 1 });

// Department student list
studentSchema.index({ departmentId: 1, isActive: 1 });

// Mentor's student list
studentSchema.index({ mentorId: 1 });

export default mongoose.model('Student', studentSchema);