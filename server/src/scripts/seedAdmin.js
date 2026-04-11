import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admin.js';
import connectDB from '../config/db.js';
import logger from '../utils/logger.js';

const seedAdmin = async () => {
  try {
    await connectDB();

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@nodues.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const adminName = process.env.ADMIN_NAME || 'System Admin';

    // 2. Check if Admin already exists
    const existingAdmin = await Admin.findOne({ email: adminEmail });
    if (existingAdmin) {
      logger.info(`Admin with email ${adminEmail} already exists. Skipping seed.`);
      process.exit(0);
    }

    // 3. Create Super Admin
    // Note: Password hashing is handled by the model's pre-save hook
    const admin = new Admin({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      isSuperAdmin: true,
      role: 'admin',
      mustChangePassword: true
    });

    await admin.save();

    logger.info('Admin seeded successfully!', {
      email: adminEmail,
      role: 'Super Admin'
    });

    process.exit(0);
  } catch (error) {
    logger.error('Failed to seed admin', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

seedAdmin();
