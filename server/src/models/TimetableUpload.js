import mongoose from 'mongoose';

/**
 * TimetableUpload Schema — Audit trail for timetable parsing
 * TRD Reference: TRD §4 Data Schemas (timetableUploads) | Requirements: FR-C1 to FR-C8, MON-4
 */
const timetableUploadSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Class',
      required: [true, 'Class ID is required'],
    },
    targetSemester: {
      type: Number,
      required: [true, 'Target semester is required'],
      min: 1,
      max: 8,
    },
    uploadedBy: {
      type: mongoose.Schema.ObjectId,
      refPath: 'uploaderModel',
      required: true,
    },
    uploaderModel: {
      type: String,
      enum: ['Admin', 'Faculty'],
      default: 'Admin',
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
    },
    parsedRowCount: {
      type: Number,
      default: 0,
    },
    matchedRowCount: {
      type: Number,
      default: 0,
    },
    flaggedRowCount: {
      type: Number,
      default: 0,
    },
    committed: {
      type: Boolean,
      default: false,
    },
    committedAt: {
      type: Date,
      default: null,
    },
    parsedData: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

timetableUploadSchema.index({ classId: 1, targetSemester: 1 });
timetableUploadSchema.index({ committed: 1 });

const TimetableUpload = mongoose.model('TimetableUpload', timetableUploadSchema);

export default TimetableUpload;
