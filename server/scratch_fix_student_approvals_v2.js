import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './src/models/Student.js';
import NodueApproval from './src/models/NodueApproval.js';
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

    // Find their respective requests
    const r1 = await NodueRequest.findOne({ studentId: s1._id }).lean();
    const r2 = await NodueRequest.findOne({ studentId: s2._id }).lean();

    if (!r1 || !r2) {
        console.log('Requests not found for one or both students');
        process.exit(1);
    }

    console.log(`Target Request ID: ${r1._id}`);
    console.log(`Ref Request ID: ${r2._id}`);

    // 1. Assign Mentor if missing
    if (!s1.mentorId && s2.mentorId) {
        await Student.updateOne({ _id: s1._id }, { $set: { mentorId: s2.mentorId } });
        console.log(`Assigned mentor ${s2.mentorId} to ${targetRollNo}`);
    }

    // 2. Find missing approvals
    const a1 = await NodueApproval.find({ studentId: s1._id }).lean();
    const a2 = await NodueApproval.find({ studentId: s2._id }).lean();

    const missingApprovals = [];
    
    // Helper to cleanup and prepare approval for insertion
    const prepareApproval = (refA) => {
        const { _id, studentId, studentRollNo, studentName, requestId, createdAt, actionedAt, actionedByRole, remarks, ...rest } = refA;
        return {
            ...rest,
            studentId: s1._id,
            studentRollNo: targetRollNo,
            studentName: s1.name,
            requestId: r1._id,
            action: 'pending',
            createdAt: new Date(),
            actionedAt: null,
            actionedByRole: null,
            remarks: null
        };
    };

    // Check for Mentor approval
    const hasMentorApproval = a1.some(a => a.approvalType === 'mentor');
    const refMentorApproval = a2.find(a => a.approvalType === 'mentor');
    if (!hasMentorApproval && refMentorApproval) {
        missingApprovals.push(prepareApproval(refMentorApproval));
    }

    // Check for Co-Curricular approvals
    const cocurs2 = a2.filter(a => a.approvalType === 'coCurricular');
    for (const refA of cocurs2) {
        const alreadyHas = a1.some(a => a.approvalType === 'coCurricular' && a.itemTypeName === refA.itemTypeName);
        if (!alreadyHas) {
            missingApprovals.push(prepareApproval(refA));
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
