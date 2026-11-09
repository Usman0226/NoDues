#!/usr/bin/env node

/**
 * verify-counts.js — Read-only per-collection document count verification
 * TRD Reference: TRD §5 Phase 0 (Steps 0.2, 0.3) | Constraints: NC-1, NC-2
 *
 * Usage:
 *   node scripts/verify-counts.js [MONGO_URI] [--json]
 *   node scripts/verify-counts.js --uri="mongodb+srv://..." --json
 *
 * Safe & Read-Only:
 *   - Performs only db.listCollections() and collection.countDocuments({})
 *   - Redacts credentials in all logs
 *   - Returns deterministic JSON or table output for diff comparisons
 */

const path = require('path');
const fs = require('fs');

// Attempt to load mongoose from server/node_modules if not present at root
let mongoose;
try {
  mongoose = require('mongoose');
} catch (e) {
  try {
    mongoose = require(path.resolve(__dirname, '../server/node_modules/mongoose'));
  } catch (e2) {
    console.error('Error: Could not locate mongoose. Ensure dependencies are installed in ./server.');
    process.exit(1);
  }
}

// Helper to safely redact credentials from connection string
function redactUri(uri) {
  if (!uri) return '';
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let uri = process.env.VERIFY_URI || process.env.MONGODB_URI || null;
  let jsonOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      jsonOnly = true;
    } else if (arg.startsWith('--uri=')) {
      uri = arg.substring(6);
    } else if (arg === '--uri' && args[i + 1]) {
      uri = args[++i];
    } else if (!arg.startsWith('-') && !uri) {
      uri = arg;
    }
  }

  // Fallback: check server/.env if no URI supplied
  if (!uri) {
    const envPath = path.resolve(__dirname, '../server/.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('MONGODB_URI=') || trimmed.startsWith('MONGO_URI=')) {
          uri = trimmed.substring(trimmed.indexOf('=') + 1).trim();
          break;
        }
      }
    }
  }

  return { uri, jsonOnly };
}

async function main() {
  const { uri, jsonOnly } = parseArgs();

  if (!uri) {
    console.error('Usage: node scripts/verify-counts.js <MONGO_URI> [--json]');
    console.error('Error: No MongoDB URI provided as argument or found in environment.');
    process.exit(1);
  }

  if (!jsonOnly) {
    console.log('Connecting to target cluster...');
    console.log(`URI: ${redactUri(uri)}`);
  }

  let connection;
  try {
    connection = await mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      maxPoolSize: 2, // Minimal read-only pool
    }).asPromise();
  } catch (err) {
    console.error(`Connection failed: ${err.message}`);
    process.exit(1);
  }

  try {
    const db = connection.db;
    const collections = await db.listCollections().toArray();

    // Filter out system collections
    const userCollections = collections
      .map(c => c.name)
      .filter(name => !name.startsWith('system.'))
      .sort();

    const counts = {};
    let totalDocs = 0;

    for (const name of userCollections) {
      const coll = db.collection(name);
      const count = await coll.countDocuments({});
      counts[name] = count;
      totalDocs += count;
    }

    const result = {
      database: db.databaseName,
      collectionCount: userCollections.length,
      totalDocuments: totalDocs,
      counts
    };

    if (jsonOnly) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n======================================================');
      console.log(` Database: ${db.databaseName}`);
      console.log(` Total Collections: ${userCollections.length}`);
      console.log(` Total Documents:   ${totalDocs}`);
      console.log('======================================================');
      console.log(String('Collection Name').padEnd(35) + 'Count');
      console.log('------------------------------------------------------');
      for (const [coll, count] of Object.entries(counts)) {
        console.log(String(coll).padEnd(35) + count.toLocaleString());
      }
      console.log('------------------------------------------------------');
      console.log(String('TOTAL').padEnd(35) + totalDocs.toLocaleString());
      console.log('======================================================\n');
      console.log('JSON Output (for automated diffing):');
      console.log(JSON.stringify(counts, Object.keys(counts).sort(), 2));
    }

    await connection.close();
    process.exit(0);
  } catch (err) {
    console.error(`Error counting documents: ${err.message}`);
    if (connection) await connection.close();
    process.exit(1);
  }
}

main();
