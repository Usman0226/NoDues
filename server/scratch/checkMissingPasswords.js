import mongoose from 'mongoose';
import 'dotenv/config';
import Faculty from '../src/models/Faculty.js';

const checkMissingPasswords = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const total = await Faculty.countDocuments();
        const missing = await Faculty.countDocuments({ password: { $exists: false } });
        console.log(`Total Faculty: ${total}`);
        console.log(`Missing Passwords: ${missing}`);
        
        if (missing > 0) {
            const list = await Faculty.find({ password: { $exists: false } }, 'name email employeeId');
            console.log('Faculty with missing passwords:', JSON.stringify(list, null, 2));
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkMissingPasswords();
