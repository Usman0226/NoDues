import mongoose from 'mongoose';

const featureFlagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Flag name is required'],
      unique: true,
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    updatedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
  }
);

const FeatureFlag = mongoose.model('FeatureFlag', featureFlagSchema);

export default FeatureFlag;
