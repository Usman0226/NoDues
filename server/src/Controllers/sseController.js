import logger from '../utils/logger.js';

// Active SSE clients: Map<userId, Set<res>>
const clients = new Map();

/**
 * Register an SSE response object for a user.
 * Multiple tabs are supported (Set per userId).
 */
const addClient = (userId, res) => {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
};

const removeClient = (userId, res) => {
  clients.get(userId)?.delete(res);
  if (clients.get(userId)?.size === 0) clients.delete(userId);
};

// De-duplication cache: Map<userId_eventName_payloadHash, lastSentTimestamp>
const recentEvents = new Map();

// Cleanup interval for the de-duplication cache (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentEvents.entries()) {
    if (now - timestamp > 5000) recentEvents.delete(key);
  }
}, 300_000);


export const pushEvent = (userIds, eventName, payload) => {
  const data = JSON.stringify({ event: eventName, ...payload });
  const eventId = Date.now();
  
  // Create a fingerprint for de-duplication
  const payloadStr = JSON.stringify(payload);

  for (const uid of userIds) {
    const fingerPrint = `${uid}_${eventName}_${payloadStr}`;
    const lastSent = recentEvents.get(fingerPrint);
    
    // Skip if identical event was sent to this user in the last 1000ms
    if (lastSent && eventId - lastSent < 1000) {
      continue;
    }
    
    recentEvents.set(fingerPrint, eventId);

    const connections = clients.get(uid);
    if (!connections) continue;
    for (const res of connections) {
      try {
        res.write(`id: ${eventId}\nevent: ${eventName}\ndata: ${data}\n\n`);
      } catch (e) {
        logger.warn('SSE write failed', { userId: uid, error: e.message });
        removeClient(uid, res);
      }
    }
  }
};

export const sseConnect = (req, res) => {
  const { userId } = req.user;
  const { id: contextId } = req.params; // Supports /batch/:id or /department/:id
  const path = req.path;


  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Critical for Nginx
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Ensure headers are sent immediately
  res.flushHeaders();

  // Tell client to reconnect after 10 seconds if connection is lost
  res.write('retry: 10000\n\n');

  // Send initial heartbeat so the browser knows the connection is live
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, ts: Date.now(), context: contextId || 'global' })}\n\n`);

  addClient(userId, res);

  logger.info('sse_connected', {
    timestamp: new Date().toISOString(),
    actor: userId,
    action: 'SSE_CONNECT',
    resource_id: contextId || null,
    metadata: { path }
  });

  // Heartbeat every 15s (reduced from 25s) to prevent proxy/firewall timeouts
  // Many cloud load balancers have 30-60s timeouts
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    // Standard SSE comment heartbeat to keep connection alive
    res.write(': heartbeat\n\n');
  }, 15_000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
    logger.info('sse_disconnected', {
      timestamp: new Date().toISOString(),
      actor: userId,
      action: 'SSE_DISCONNECT',
      resource_id: null,
    });
  });
};
