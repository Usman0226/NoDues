import mongoose from 'mongoose';
import { invalidateEntityCache } from '../utils/cacheHooks.js';

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

// ── Persistent Class Semester Subjects Schema (FR-B1 to FR-B4) ────────────────
const semesterSubjectItemSchema = new mongoose.Schema(
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
      default: null,
    },
    facultyName: { type: String, trim: true, default: null },
    coFacultyIds: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'Faculty',
      },
    ],
    source: {
      type: String,
      enum: ['timetable_parse', 'manual', 'cloned'],
      default: 'manual',
    },
  },
  { _id: true }
);

const semesterEntrySchema = new mongoose.Schema(
  {
    subjects: {
      type: [semesterSubjectItemSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
    setAt: {
      type: Date,
      default: Date.now,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const classSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Class name is required'],
      trim: true,
    },
    batchId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Batch',
      default: null,
    },
    semesterSubjects: {
      type: Map,
      of: semesterEntrySchema,
      default: () => new Map(),
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
classSchema.index({ batchId: 1 });
classSchema.index({ departmentId: 1, isActive: 1 });
classSchema.index({ departmentId: 1, semester: 1, academicYear: 1 });
classSchema.index({ classTeacherId: 1 });

// ── Cache Invalidation Hooks ──────────────────────────────────────────────────
classSchema.post('save', function(doc) {
  invalidateEntityCache('class', doc._id, doc.departmentId);
});

classSchema.post('findOneAndUpdate', async function() {
  const query = this.getQuery();
  const doc = await this.model.findOne(query);
  if (doc) invalidateEntityCache('class', doc._id, doc.departmentId);
});

export default mongoose.model('Class', classSchema);
