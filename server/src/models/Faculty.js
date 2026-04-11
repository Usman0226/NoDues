import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
      enum: ['faculty', 'classTeacher', 'mentor', 'hod'],
      default: ['faculty'],
    },
    /**
     * Primary role derived from roleTags.
     * If 'hod' is in roleTags → role = 'hod', otherwise 'faculty'.
     */
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

// ── M0-safe indexes (email & employeeId unique:true create their indexes automatically) ──
facultySchema.index({ departmentId: 1, isActive: 1 });

// ── Pre-save: hash password ───────────────────────────────────────────────────
facultySchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Pre-save: derive primary role from roleTags ───────────────────────────────
facultySchema.pre('save', function (next) {
  this.role = this.roleTags.includes('hod') ? 'hod' : 'faculty';
  next();
});

export default mongoose.model('Faculty', facultySchema);
