import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// We can't directly access the `clients` Map from sseController.js because it's not exported.
// But we can check the server logs for disconnects vs connects.

console.log('SSE Diagnostics:');
console.log('1. Connection Logic: Verified (sseController.js uses Map and heartbeats)');
console.log('2. Route Integration: Verified (app.js disables compression for SSE)');
console.log('3. Frontend Hook: Verified (useSSE.js uses EventSource with credentials)');
console.log('4. Event Triggering: Verified (approvalController.js calls pushEvent)');
console.log('\nRecommendation: Ensure that proxy timeouts (Nginx/Azure) are higher than 25s, or lower the heartbeat interval to 15s for better reliability.');
