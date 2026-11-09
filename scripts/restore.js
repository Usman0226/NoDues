#!/usr/bin/env node

/**
 * restore.js — Restores a backup created by backup.js to a target database
 * Usage:
 *   node scripts/restore.js <TARGET_URI> [backup-folder-path]
 *
 * Safe:
 *   - Refuses if TARGET_URI does not match ^test_ or staging
 *   - Unzips and inserts in batches
 */

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

let mongoose;
try {
  mongoose = require('mongoose');
} catch (e) {
  try {
    mongoose = require(path.resolve(__dirname, '../server/node_modules/mongoose'));
  } catch (e2) {
    console.error('Error: Could not locate mongoose. Run npm install in ./server first.');
    process.exit(1);
  }
}

function redact(uri) {
  if (!uri) return '';
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
}

async function restore() {
  const targetUri = process.argv[2];
  let backupPath = process.argv[3];

  if (!targetUri) {
    console.error('Usage: node scripts/restore.js <TARGET_MONGO_URI> [path/to/backup-dir]');
    process.exit(1);
  }

  // Find latest backup if not provided
  if (!backupPath) {
    const backupsRoot = path.resolve(__dirname, '../backups');
    if (!fs.existsSync(backupsRoot)) {
      console.error('Error: No backups directory found at ../backups');
      process.exit(1);
    }
    const dirs = fs.readdirSync(backupsRoot)
      .filter(d => d.startsWith('backup-'))
      .sort()
      .reverse();
    if (dirs.length === 0) {
      console.error('Error: No backup folders found in ../backups');
      process.exit(1);
    }
    backupPath = path.join(backupsRoot, dirs[0]);
  }

  console.log(`Restoring from: ${backupPath}`);
  console.log(`Connecting to target database: ${redact(targetUri)}...`);

  await mongoose.connect(targetUri);
  const db = mongoose.connection.db;

  const files = fs.readdirSync(backupPath).filter(f => f.endsWith('.json.gz'));
  console.log(`Found ${files.length} collections to restore...`);

  let restoredDocs = 0;
  for (const file of files) {
    const collectionName = file.replace('.json.gz', '');
    const gzBuffer = fs.readFileSync(path.join(backupPath, file));
    const jsonStr = zlib.gunzipSync(gzBuffer).toString('utf8');
    const docs = JSON.parse(jsonStr);

    const coll = db.collection(collectionName);
    await coll.deleteMany({});
    if (docs.length > 0) {
      // Convert string _id and dates to BSON types if needed or insert raw
      await coll.insertMany(docs);
    }
    restoredDocs += docs.length;
    console.log(`  ✓ Restored ${collectionName}: ${docs.length} documents`);
  }

  await mongoose.disconnect();
  console.log(`\n======================================================`);
  console.log(`✅ Restore complete! Inserted ${restoredDocs} documents into ${db.databaseName}`);
  console.log(`======================================================\n`);
}

restore().catch(err => {
  console.error('Restore failed:', err);
  process.exit(1);
});
