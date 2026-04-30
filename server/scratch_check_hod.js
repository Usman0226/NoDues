const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const NodueApproval = mongoose.model('NodueApproval', new mongoose.Schema({}, { strict: false }));
const NodueRequest = mongoose.model('NodueRequest', new mongoose.Schema({}, { strict: false }));

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const hodCount = await NodueApproval.countDocuments({ approvalType: 'hodApproval' });
    const aoCount = await NodueApproval.countDocuments({ approvalType: 'aoApproval' });
    const hodRoleCount = await NodueApproval.countDocuments({ roleTag: 'hod' });
    const aoRoleCount = await NodueApproval.countDocuments({ roleTag: 'ao' });

    console.log('hodApproval records:', hodCount);
    console.log('aoApproval records:', aoCount);
    console.log('roleTag hod records:', hodRoleCount);
    console.log('roleTag ao records:', aoRoleCount);

    const snapshotCount = await NodueRequest.countDocuments({
      $or: [
        { 'facultySnapshot.hod': { $exists: true } },
        { 'facultySnapshot.ao': { $exists: true } }
      ]
    });
    console.log('Requests with hod/ao snapshots:', snapshotCount);

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

check();
