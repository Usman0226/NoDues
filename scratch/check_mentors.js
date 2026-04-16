import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../server/src/models/Student.js';
import Faculty from '../server/src/models/Faculty.js';

dotenv.config({ path: '../server/.env' });

const checkDanglingMentors = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const students = await Student.find({ mentorId: { $ne: null } }).select('rollNo name mentorId').lean();
        console.log(`Checking ${students.length} students with mentors...`);

        let issues = 0;
        for (const s of students) {
            const faculty = await Faculty.findById(s.mentorId).select('_id name').lean();
            if (!faculty) {
                console.log(`[ISSUE] Student ${s.rollNo} (${s.name}) has mentorId ${s.mentorId} but no corresponding Faculty document exists.`);
                issues++;
            }
        }

        if (issues === 0) {
            console.log('No dangling mentor links found. Data integrity is intact.');
        } else {
            console.log(`Found ${issues} dangling mentor links.`);
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error during check:', err);
        process.exit(1);
    }
};

checkDanglingMentors();
