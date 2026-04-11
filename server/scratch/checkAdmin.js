import mongoose from 'mongoose';
import 'dotenv/config';
import Admin from '../src/models/Admin.js';

const checkAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const admins = await Admin.find({}).select('+password');
        console.log(`Found ${admins.length} admin members:`);
        admins.forEach(a => {
            console.log(`- Name: ${a.name}, Email: ${a.email}, PasswordHash: ${a.password ? 'Exists' : 'MISSING'}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkAdmin();
