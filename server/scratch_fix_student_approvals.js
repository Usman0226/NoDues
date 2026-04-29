import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './src/models/Student.js';
import NodueApproval from './src/models/NodueApproval.js';
import Faculty from './src/models/Faculty.js';
import NodueRequest from './src/models/NodueRequest.js';

dotenv.config();

async function fixStudent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const targetRollNo = '23691A3219';
    const refRollNo = '23691A3222';

    const s1 = await Student.findOne({ rollNo: targetRollNo }).lean();
    const s2 = await Student.findOne({ rollNo: refRollNo }).lean();

    if (!s1 || !s2) {
      console.log('Students not found');
      process.exit(1);
    }

    // 1. Assign Mentor if missing (copying from ref student for this fix)
    if (!s1.mentorId && s2.mentorId) {
        await Student.updateOne({ _id: s1._id }, { $set: { mentorId: s2.mentorId } });
        console.log(`Assigned mentor ${s2.mentorId} to ${targetRollNo}`);
    }

    // 2. Find missing approvals
    const a1 = await NodueApproval.find({ studentId: s1._id }).lean();
    const a2 = await NodueApproval.find({ studentId: s2._id }).lean();

    // Get a requestId to associate with
    const existingApproval = a1[0];
    if (!existingApproval) {
        console.log('No existing approvals found for target student');
        process.exit(1);
    }

    const missingApprovals = [];
    
    // Check for Mentor approval
    const hasMentorApproval = a1.some(a => a.approvalType === 'mentor');
    const refMentorApproval = a2.find(a => a.approvalType === 'mentor');
    if (!hasMentorApproval && refMentorApproval) {
        missingApprovals.push({
            ...refMentorApproval,
            _id: new mongoose.Types.ObjectId(),
            studentId: s1._id,
            studentRollNo: targetRollNo,
            studentName: s1.name,
            action: 'pending',
            createdAt: new Date(),
            actionedAt: null,
            actionedByRole: null,
            remarks: null
        });
    }

    // Check for Co-Curricular approvals
    const cocurs2 = a2.filter(a => a.approvalType === 'coCurricular');
    for (const refA of cocurs2) {
        const alreadyHas = a1.some(a => a.approvalType === 'coCurricular' && a.itemTypeName === refA.itemTypeName);
        if (!alreadyHas) {
            missingApprovals.push({
                ...refA,
                _id: new mongoose.Types.ObjectId(),
                studentId: s1._id,
                studentRollNo: targetRollNo,
                studentName: s1.name,
                action: 'pending',
                createdAt: new Date(),
                actionedAt: null,
                actionedByRole: null,
                remarks: null
            });
        }
    }

    if (missingApprovals.length > 0) {
        console.log(`Creating ${missingApprovals.length} missing approvals for ${targetRollNo}...`);
        await NodueApproval.insertMany(missingApprovals);
        console.log('Done!');
    } else {
        console.log('No missing approvals found.');
    }

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

fixStudent();
