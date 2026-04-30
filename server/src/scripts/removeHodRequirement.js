import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from server root
dotenv.config({ path: path.join(__dirname, '../../.env') });

import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import { recalcRequestStatus } from '../Controllers/approvalController.js';
import connectDB from '../config/db.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  try {
    await connectDB();
    console.log('--- HOD REQUIREMENT REMOVAL SCRIPT ---');
    if (DRY_RUN) console.log('>>> DRY RUN ENABLED - NO CHANGES WILL BE PERSISTED <<<');

    // 1. Find all hodApproval records
    const approvals = await NodueApproval.find({ approvalType: 'hodApproval' }).select('_id requestId');
    console.log(`Found ${approvals.length} HoD approval records.`);

    const affectedRequestIds = new Set();
    approvals.forEach(a => affectedRequestIds.add(a.requestId.toString()));

    if (!DRY_RUN) {
      const deleteResult = await NodueApproval.deleteMany({ approvalType: 'hodApproval' });
      console.log(`Deleted ${deleteResult.deletedCount} HoD approval records.`);
    } else {
      console.log(`[DRY RUN] Would delete ${approvals.length} HoD approval records.`);
    }

    // 2. Find requests with HoD in facultySnapshot
    const requestsWithSnapshot = await NodueRequest.find({
      $or: [
        { 'facultySnapshot.hod': { $exists: true } },
        { 'facultySnapshot.ao': { $exists: true } }
      ]
    });
    console.log(`Found ${requestsWithSnapshot.length} requests with HoD/AO in facultySnapshot (Object format).`);

    const requestsWithArraySnapshot = await NodueRequest.find({
      'facultySnapshot': {
        $elemMatch: { roleTag: { $in: ['hod', 'ao'] } }
      }
    });
    console.log(`Found ${requestsWithArraySnapshot.length} requests with HoD/AO in facultySnapshot (Array format).`);

    const allAffectedRequests = [...new Set([...requestsWithSnapshot, ...requestsWithArraySnapshot])];
    
    let snapshotUpdates = 0;
    for (const request of allAffectedRequests) {
      affectedRequestIds.add(request._id.toString());
      
      if (Array.isArray(request.facultySnapshot)) {
        const originalLen = request.facultySnapshot.length;
        request.facultySnapshot = request.facultySnapshot.filter(f => !['hod', 'ao'].includes(f.roleTag));
        if (originalLen !== request.facultySnapshot.length) {
            if (!DRY_RUN) {
                request.markModified('facultySnapshot');
                await request.save();
            }
            snapshotUpdates++;
        }
      } else if (request.facultySnapshot && typeof request.facultySnapshot === 'object') {
        let changed = false;
        if (request.facultySnapshot.hod) { delete request.facultySnapshot.hod; changed = true; }
        if (request.facultySnapshot.ao) { delete request.facultySnapshot.ao; changed = true; }
        
        if (changed) {
            if (!DRY_RUN) {
                request.markModified('facultySnapshot');
                await request.save();
            }
            snapshotUpdates++;
        }
      }
    }
    console.log(`${DRY_RUN ? '[DRY RUN] Would update' : 'Updated'} facultySnapshot for ${snapshotUpdates} requests.`);

    // 3. Recalculate status for all affected requests
    console.log(`Recalculating status for ${affectedRequestIds.size} unique requests...`);
    let clearedCount = 0;
    let index = 0;
    
    for (const requestId of affectedRequestIds) {
      index++;
      if (index % 100 === 0) console.log(`Progress: ${index}/${affectedRequestIds.size}`);
      
      const request = await NodueRequest.findById(requestId).select('status');
      if (!request) continue;

      // SAFETY: Preserving HOD Overrides - do not recalc if already overridden
      if (request.status === 'hod_override') {
        continue;
      }

      if (!DRY_RUN) {
        const oldStatus = request.status;
        const newStatus = await recalcRequestStatus(requestId);
        if (oldStatus !== 'cleared' && newStatus === 'cleared') {
          clearedCount++;
        }
      } else {
        // In dry run, we can't easily call recalcRequestStatus because it writes to DB
        // But we can estimate
      }
    }

    console.log('--- SUMMARY ---');
    console.log(`Total Requests Affected: ${affectedRequestIds.size}`);
    if (!DRY_RUN) {
      console.log(`Students newly CLEARED: ${clearedCount}`);
    } else {
      console.log('DRY RUN COMPLETE. No data was harmed.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
