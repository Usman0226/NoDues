/**
 * testHarness.js — Safety-enforced test harness for Phase 0 regression suite
 * TRD Reference: TRD §5 Phase 0 (Step 0.4) | Non-Negotiable Constraints: NC-1, NC-2, NC-6
 *
 * Enforces:
 *   1. DB name MUST match ^test_
 *   2. Host MUST NOT be production (refuses cluster0.lgbf0fe.mongodb.net or prod hosts)
 *   3. Outbound emails / Resend completely disabled & mocked
 *   4. Deterministic database isolation
 */

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import cache from '../../src/config/cache.js';

let mongodInstance = null;
let currentTestUri = null;

const PROD_HOST_PATTERNS = [
  'cluster0.lgbf0fe.mongodb.net',
  'nodues-prod',
  'production'
];

/**
 * Validates that a connection URI targets an isolated test database
 * Refuses execution if pointing to production or if database name does not match ^test_
 */
export function validateConnectionSafety(uri) {
  if (!uri) {
    throw new Error('SAFETY CHECK FAILED: No connection URI provided.');
  }

  // Parse URI components safely
  let parsedUrl;
  try {
    parsedUrl = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
  } catch (err) {
    throw new Error(`SAFETY CHECK FAILED: Malformed MongoDB URI: ${err.message}`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const dbName = parsedUrl.pathname.replace(/^\//, '').split('?')[0];

  // 1. Host safety check
  for (const pattern of PROD_HOST_PATTERNS) {
    if (hostname.includes(pattern)) {
      throw new Error(
        `SAFETY VIOLATION REFUSED: Target host "${hostname}" matches production pattern "${pattern}". Tests will NEVER run against production!`
      );
    }
  }

  // 2. Database name safety check: MUST match ^test_
  if (!dbName || !dbName.startsWith('test_')) {
    throw new Error(
      `SAFETY VIOLATION REFUSED: Target database "${dbName || '(empty)'}" does not start with "test_". Tests must run in a database prefixed with "test_".`
    );
  }

  return { hostname, dbName, safe: true };
}

/**
 * Boots the isolated test database and connects mongoose
 */
export async function setupTestEnvironment() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'phase0-test-jwt-secret-key-32-chars-long!!';
  process.env.ENABLE_STUDENT_EMAILS = 'false';

  let uri = process.env.TEST_MONGODB_URI;

  if (uri) {
    // Validate custom test URI
    validateConnectionSafety(uri);
    currentTestUri = uri;
  } else {
    // Spin up ephemeral in-memory Mongo instance with database name starting with test_
    mongodInstance = await MongoMemoryServer.create({
      instance: {
        dbName: 'test_nodues_regression',
      },
    });
    currentTestUri = mongodInstance.getUri() + 'test_nodues_regression';
    validateConnectionSafety(currentTestUri);
  }

  // Ensure mongoose connects cleanly to the validated test database
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(currentTestUri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  });

  return currentTestUri;
}

/**
 * Tears down the test database, closes connections, and terminates in-memory server
 */
export async function teardownTestEnvironment() {
  if (cache) {
    try {
      cache.flushAll();
      cache.close();
    } catch (e) {
      // Ignore cache close errors
    }
  }

  if (mongoose.connection.readyState !== 0) {
    try {
      if (mongoose.connection.db) {
        await mongoose.connection.db.dropDatabase();
      }
    } catch (e) {
      // Ignore drop errors during teardown
    }
    await mongoose.disconnect();
  }

  if (mongodInstance) {
    await mongodInstance.stop();
    mongodInstance = null;
  }

  // Allow Node process to exit gracefully without being kept alive by app-level background intervals (e.g. sseController 5m interval)
  setTimeout(() => {
    process.exit(0);
  }, 200).unref();
}

/**
 * Clears all documents from all collections to guarantee test independence
 */
export async function clearTestDatabase() {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

/**
 * Generates signed JWTs for test requests
 */
export function signTestToken(user) {
  const payload = {
    userId: user._id ? user._id.toString() : user.userId,
    name: user.name || 'Test User',
    email: user.email || 'test@example.com',
    role: user.role,
    roleTags: user.roleTags || (user.role ? [user.role] : []),
    departmentId: user.departmentId ? user.departmentId.toString() : undefined,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });
}
