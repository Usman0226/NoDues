import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import Faculty from '../src/models/Faculty.js';

const verifyAuthLogic = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const testEmail = 'projects.clg.mits@gmail.com'; // One of the existing emails found earlier
    const user = await Faculty.findOne({ email: testEmail }).select('+password');
    
    if (!user) {
      console.log('User not found in DB');
      process.exit(1);
    }

    console.log(`User found: ${user.name} (${user.email})`);
    console.log(`Stored Password Hash: ${user.password}`);

    // Try verifying with a dummy password first (expect false)
    const dummyMatch = await bcrypt.compare('WrongPass123', user.password);
    console.log(`Dummy verification (WrongPass123): ${dummyMatch}`);

    // Now, let's try to reset the password to a known value and verify it
    const newPass = 'Reset12345';
    user.password = newPass;
    await user.save();
    console.log(`Password reset to: ${newPass}`);

    // Wait 1 second to ensure DB update
    await new Promise(r => setTimeout(r, 1000));

    const updatedUser = await Faculty.findOne({ email: testEmail }).select('+password');
    console.log(`New Stored Hash: ${updatedUser.password}`);
    
    const isMatch = await bcrypt.compare(newPass, updatedUser.password);
    console.log(`Verification of new password: ${isMatch}`);

    if (isMatch) {
      console.log('✓ PASSWORD HASHING LOGIC IS WORKING CORRECTLY');
    } else {
      console.log('✖ PASSWORD HASHING LOGIC IS BROKEN');
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

verifyAuthLogic();
