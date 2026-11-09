import mongoose from 'mongoose';

/**
 * Batch Schema — Batch-Based Semester Architecture
 * TRD Reference: TRD §4 Data Schemas (batches) | Requirements: FR-A1 to FR-A7
 */
const batchSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: [true, 'Batch label is required (e.g. 2024-2028)'],
      unique: true,
      trim: true,
    },
    startYear: {
      type: Number,
      required: [true, 'Start year is required'],
      min: [2000, 'Start year must be valid'],
    },
    endYear: {
      type: Number,
      required: [true, 'End year is required'],
      validate: {
        validator: function (v) {
          return v > this.startYear;
        },
        message: 'End year must be greater than start year',
      },
    },
    currentSemester: {
      type: Number,
      required: [true, 'Current semester is required'],
      min: [1, 'Semester cannot be less than 1'],
      max: [8, 'Semester cannot be greater than 8'],
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
batchSchema.index({ isActive: 1, currentSemester: 1 });

const Batch = mongoose.model('Batch', batchSchema);

export default Batch;
