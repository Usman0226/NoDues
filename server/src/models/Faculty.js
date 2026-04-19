import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { invalidateEntityCache } from '../utils/cacheHooks.js';

const facultySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    departmentId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
    },
    roleTags: {
      type: [String],
      enum: ['faculty', 'classTeacher', 'mentor', 'hod', 'coordinator'],
      default: ['faculty'],
    },
    role: {
      type: String,
      enum: ['faculty', 'hod'],
      default: 'faculty',
    },
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

facultySchema.index({ departmentId: 1, isActive: 1 });

facultySchema.index({ departmentId: 1, roleTags: 1 });

facultySchema.pre('save', async function () {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Derive primary role from roleTags
  this.role = this.roleTags.includes('hod') ? 'hod' : 'faculty';
});

// ── Cache Invalidation Hooks ──────────────────────────────────────────────────
facultySchema.post('save', function(doc) {
  invalidateEntityCache('faculty', doc._id);
  // Clear scoped list cache entries so faculty changes appear immediately
  const allKeys = cache.keys();
  const listKeys = allKeys.filter(k =>
    k.startsWith(`faculty:list:${doc.departmentId}:`) ||
    k.startsWith('faculty:list:all:')
  );
  if (listKeys.length) cache.del(listKeys);
});

facultySchema.post('findOneAndUpdate', async function() {
  const query = this.getQuery();
  const doc = await this.model.findOne(query);
  if (!doc) return;
  invalidateEntityCache('faculty', doc._id);
  const allKeys = cache.keys();
  const listKeys = allKeys.filter(k =>
    k.startsWith(`faculty:list:${doc.departmentId}:`) ||
    k.startsWith('faculty:list:all:')
  );
  if (listKeys.length) cache.del(listKeys);
});

export default mongoose.model('Faculty', facultySchema);
