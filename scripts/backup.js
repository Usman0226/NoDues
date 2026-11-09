#!/usr/bin/env node

/**
 * backup.js — Zero-dependency, 1-command M0 Free-Tier Backup
 * Reads MONGODB_URI directly from server/.env (or argument)
 * Dumps all collections to a local timestamped folder outside git
 * No paid Atlas tier, no mongodump installation needed.
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

function getMongoUri() {
  if (process.argv[2] && !process.argv[2].startsWith('-')) {
    return process.argv[2];
  }
  const envPath = path.resolve(__dirname, '../server/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('MONGODB_URI=') && !trimmed.startsWith('#')) {
        return trimmed.substring('MONGODB_URI='.length).trim();
      }
    }
  }
  return process.env.MONGODB_URI;
}

function redact(uri) {
  if (!uri) return '';
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
}

async function backup() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Error: MONGODB_URI not found in server/.env or environment.');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, `../backups/backup-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`Connecting to database: ${redact(uri)}...`);
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const validCollections = collections
    .map(c => c.name)
    .filter(n => !n.startsWith('system.'));

  console.log(`Found ${validCollections.length} collections to back up...`);
  let totalDocs = 0;
  const manifest = {
    timestamp: new Date().toISOString(),
    database: db.databaseName,
    collections: {},
  };

  const startTime = Date.now();

  for (const name of validCollections) {
    const docs = await db.collection(name).find({}).toArray();
    totalDocs += docs.length;
    manifest.collections[name] = docs.length;

    const filePath = path.join(backupDir, `${name}.json.gz`);
    const jsonStr = JSON.stringify(docs);
    const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
    fs.writeFileSync(filePath, compressed);
    console.log(`  ✓ ${name}: ${docs.length} documents (${(compressed.length / 1024).toFixed(1)} KB)`);
  }

  fs.writeFileSync(
    path.join(backupDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  await mongoose.disconnect();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n======================================================`);
  console.log(`✅ Backup successfully created in ${elapsed}s!`);
  console.log(`📁 Location: ${backupDir}`);
  console.log(`📊 Total: ${totalDocs} documents across ${validCollections.length} collections`);
  console.log(`======================================================\n`);
}

backup().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
