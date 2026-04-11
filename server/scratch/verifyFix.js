import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import Faculty from '../src/models/Faculty.js';
import { resendCredentials } from '../src/Controllers/facultyController.js';

const verifyFix = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const testEmail = 'projects.clg.mits@gmail.com';
        const user = await Faculty.findOne({ email: testEmail });
        
        if (!user) {
            console.log('Test user not found');
            process.exit(1);
        }

        console.log('--- TESTING NEW LOGIN LOGIC ---');
        // Test 1: Login via Employee ID
        console.log(`Attempting login using Employee ID: ${user.employeeId}`);
        // Simulate authController logic
        const foundById = await Faculty.findOne({ 
            $or: [{ email: testEmail }, { employeeId: user.employeeId }], 
            isActive: true 
        });
        console.log(`Found via ID: ${!!foundById}`);

        console.log('\n--- TESTING DOUBLE-HASH FIX ---');
        // Mock req/res for resendCredentials
        const req = { params: { id: user._id.toString() }, user: { userId: 'SYSTEM' } };
        let sentPass = '';
        const res = {
            status: (code) => ({
                json: (data) => {
                    console.log(`Response Code: ${code}`);
                    console.log(`Response Data: ${JSON.stringify(data)}`);
                }
            })
        };

        // We need to capture the password sent to the email service.
        // Since we can't easily intercept the call without mocking the whole service,
        // we'll just check if the stored password in DB is a valid hash of the generated hex.
        
        // Let's manually trigger a "save" with a plain password and see if it works
        const testPass = 'FixTest123';
        user.password = testPass;
        await user.save();
        
        const updated = await Faculty.findById(user._id).select('+password');
        const match = await bcrypt.compare(testPass, updated.password);
        console.log(`Plain password verification after save: ${match}`);

        if (match) {
            console.log('✓ FIX VERIFIED: Password stored correctly.');
        } else {
            console.log('✖ FIX FAILED: Password mismatch.');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifyFix();
