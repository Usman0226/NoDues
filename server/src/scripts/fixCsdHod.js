import mongoose from 'mongoose';
import Faculty from '../models/Faculty.js';
import Department from '../models/Department.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function fixCsdHod() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const csdDeptName = 'CSD';
    const kusumaId = new mongoose.Types.ObjectId('69dbf7b8f658462774778108');
    const kusumaName = 'Dr. S. Kusuma';
    const testHodIds = [
      '69da7dccface163b9fe57963', // Test HOD (caps)
      '69f05b9d0f31dc0b9655d5a4'  // Test HoD (mixed)
    ];

    // 1. Ensure Department hodId is correct
    const deptUpdate = await Department.updateOne(
      { name: csdDeptName },
      { hodId: kusumaId }
    );
    console.log('Department update result:', deptUpdate);

    // 2. Ensure Dr. S. Kusuma has the HOD role
    const kusumaUpdate = await Faculty.updateOne(
      { _id: kusumaId },
      { 
        $addToSet: { roleTags: 'hod' },
        role: 'hod'
      }
    );
    console.log('Dr. S. Kusuma faculty update result:', kusumaUpdate);

    // 3. Disable old Test HODs
    const testHodUpdate = await Faculty.updateMany(
      { _id: { $in: testHodIds.map(id => new mongoose.Types.ObjectId(id)) } },
      { 
        isActive: false,
        $pull: { roleTags: 'hod' }
      }
    );
    console.log('Test HOD faculty update result:', testHodUpdate);

    // 4. Update NodueApproval records pointing to old Test HOD
    // We only update if roleTag is 'hod' to be safe
    const approvalUpdate = await NodueApproval.updateMany(
      { 
        facultyId: { $in: testHodIds.map(id => new mongoose.Types.ObjectId(id)) }, 
        roleTag: 'hod' 
      },
      { facultyId: kusumaId }
    );
    console.log('NodueApproval update result:', approvalUpdate);

    // 5. Update NodueRequest facultySnapshots (Global search)
    const allRequestsWithTestHod = await NodueRequest.find({
      $or: [
        { 'facultySnapshot.hod.facultyId': { $in: testHodIds } },
        { 'facultySnapshot.hod.facultyName': /Test/i }
      ]
    });
    console.log(`Found ${allRequestsWithTestHod.length} global NodueRequests with Test HOD in snapshot`);

    let updatedRequestsCount = 0;
    for (const req of allRequestsWithTestHod) {
      let modified = false;
      if (req.facultySnapshot) {
        // Check all roles in snapshot
        for (const key in req.facultySnapshot) {
          const entry = req.facultySnapshot[key];
          if (entry && (testHodIds.includes(entry.facultyId?.toString()) || (entry.facultyName && entry.facultyName.match(/Test/i)))) {
            entry.facultyId = kusumaId.toString();
            entry.facultyName = kusumaName;
            modified = true;
          }
        }
      }

      if (modified) {
        req.markModified('facultySnapshot');
        await req.save();
        updatedRequestsCount++;
      }
    }
    console.log(`Updated ${updatedRequestsCount} total NodueRequest snapshots`);

    // 6. Update Class records (subjectAssignments)
    const classesToUpdate = await Class.find({
      'subjectAssignments.facultyId': { $in: testHodIds.map(id => new mongoose.Types.ObjectId(id)) }
    });
    console.log(`Found ${classesToUpdate.length} Classes to update faculty names for`);
    
    for (const cls of classesToUpdate) {
      cls.subjectAssignments.forEach(sa => {
        if (sa.facultyId && testHodIds.includes(sa.facultyId.toString())) {
          sa.facultyId = kusumaId;
          sa.facultyName = kusumaName;
        }
      });
      await cls.save();
    }

    // 7. Update Student records (electiveSubjects)
    const studentsToUpdate = await Student.find({
      'electiveSubjects.facultyId': { $in: testHodIds.map(id => new mongoose.Types.ObjectId(id)) }
    });
    console.log(`Found ${studentsToUpdate.length} Students to update elective faculty names for`);

    for (const student of studentsToUpdate) {
      student.electiveSubjects.forEach(es => {
        if (es.facultyId && testHodIds.includes(es.facultyId.toString())) {
          es.facultyId = kusumaId;
          es.facultyName = kusumaName;
        }
      });
      await student.save();
    }

    console.log('CSD HoD fix completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing CSD HoD:', error);
    process.exit(1);
  }
}

fixCsdHod();
