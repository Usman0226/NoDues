import mongoose from 'mongoose';
import 'dotenv/config';
import Faculty from '../src/models/Faculty.js';

const checkFaculty = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const faculty = await Faculty.find({}).select('+password');
        console.log(`Found ${faculty.length} faculty members:`);
        faculty.forEach(f => {
            console.log(`- Name: ${f.name}, Email: ${f.email}, IsActive: ${f.isActive}, Role: ${f.role}, PasswordHash: ${f.password ? 'Exists' : 'MISSING'}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkFaculty();
