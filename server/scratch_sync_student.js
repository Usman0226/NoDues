import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './src/models/Student.js';
import Class from './src/models/Class.js';
import NodueBatch from './src/models/NodueBatch.js';
import NodueRequest from './src/models/NodueRequest.js';
import NodueApproval from './src/models/NodueApproval.js';
import Faculty from './src/models/Faculty.js';
import CoCurricularType from './src/models/CoCurricularType.js';
import { generateStudentSnapshotData } from './src/utils/batchSync.js';
import { recalcRequestStatus } from './src/Controllers/approvalController.js';
import { invalidateEntityCache } from './src/utils/cacheHooks.js';

dotenv.config();

async function syncTargetStudent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const rollNo = '23691A3219';
    const student = await Student.findOne({ rollNo }).lean();
    if (!student) {
      console.log('Student not found');
      process.exit(0);
    }

    const batch = await NodueBatch.findOne({ classId: student.classId, status: 'active' }).lean();
    if (!batch) {
      console.log('No active batch for student class');
      process.exit(0);
    }

    const cls = await Class.findById(batch.classId).lean();
    
    const [hodAccount, ctInfo, coCurricularItems, mentors] = await Promise.all([
      Faculty.findOne({ departmentId: cls.departmentId, roleTags: 'hod' }).lean(),
      cls.classTeacherId ? Faculty.findById(cls.classTeacherId).select('name').lean() : null,
      CoCurricularType.find({ departmentId: cls.departmentId, isActive: true }).populate('coordinatorId', 'name').lean(),
      Faculty.find({ _id: { $in: [student.mentorId].filter(Boolean) } }).select('name').lean()
    ]);

    const mentorMap = new Map(mentors.map(m => [m._id.toString(), m.name]));

    console.log(`Syncing student ${rollNo} for batch ${batch._id}...`);

    let request = await NodueRequest.findOne({ batchId: batch._id, studentId: student._id });
    
    const freshSnapshot = generateStudentSnapshotData(student, cls, {
      hodAccount,
      ctInfo,
      mentorMap,
      coCurricularItems
    });

    if (!request) {
      console.log('Creating missing NodueRequest...');
      request = await NodueRequest.create({
        batchId: batch._id,
        studentId: student._id,
        studentSnapshot: {
          rollNo: student.rollNo,
          name: student.name,
          departmentName: cls.departmentId?.name ?? null,
        },
        facultySnapshot: freshSnapshot,
        status: 'pending'
      });
    } else {
      console.log('Updating existing NodueRequest...');
      request.facultySnapshot = freshSnapshot;
      request.markModified('facultySnapshot');
      await request.save();
    }

    // Ensure all approval records from snapshot exist
    for (const f of Object.values(freshSnapshot)) {
      const query = {
        requestId: request._id,
        roleTag: f.roleTag,
        itemTypeId: f.itemTypeId ?? null,
        subjectId: f.subjectId ?? null
      };

      const existing = await NodueApproval.findOne(query);

      if (!existing) {
        console.log(`Creating approval record for ${f.roleTag}...`);
        await NodueApproval.create({
          requestId: request._id,
          batchId: batch._id,
          studentId: student._id,
          studentRollNo: student.rollNo,
          studentName: student.name,
          facultyId: f.facultyId,
          subjectId: f.subjectId ?? null,
          subjectName: f.subjectName ?? null,
          itemTypeId: f.itemTypeId ?? null,
          itemTypeName: f.itemTypeName ?? null,
          itemCode: f.itemCode ?? null,
          isOptional: f.isOptional ?? false,
          approvalType: f.approvalType,
          roleTag: f.roleTag,
          action: f.approvalType === 'coCurricular' ? 'not_submitted' : 'pending'
        });
      }
    }
    
    await recalcRequestStatus(request._id);
    invalidateEntityCache('student', student._id);

    console.log('Sync completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

syncTargetStudent();
