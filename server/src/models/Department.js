import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    hodId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Faculty',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

departmentSchema.index({ hodId: 1 });

export default mongoose.model('Department', departmentSchema);
