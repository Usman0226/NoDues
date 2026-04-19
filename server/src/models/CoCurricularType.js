import mongoose from 'mongoose';
import { invalidateEntityCache } from '../utils/cacheHooks.js';

const coCurricularTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Item code is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    departmentId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
    },
    applicableYears: {
      type: [Number],
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: 'At least one applicable year is required',
      },
    },
    coordinatorId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Faculty',
    },
    fields: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        type: {
          type: String,
          enum: ['text', 'textarea', 'url', 'date', 'number', 'select'],
          default: 'text',
        },
        required: { type: Boolean, default: true },
        maxLength: { type: Number },
        options: [String], 
      },
    ],
    isOptional: {
      type: Boolean,
      default: false,
    },
    requiresMentorApproval: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);



coCurricularTypeSchema.post('save', async function (doc) {
  invalidateEntityCache('coCurricularType', doc.departmentId);
});

coCurricularTypeSchema.post('findOneAndUpdate', async function (doc) {
  if (doc) invalidateEntityCache('coCurricularType', doc.departmentId);
});

export default mongoose.model('CoCurricularType', coCurricularTypeSchema);
