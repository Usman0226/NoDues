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

/**
 * Push a typed event to all connected clients for the given userIds.
 * @param {string[]} userIds
 * @param {string}   eventName  - e.g. 'approval_update'
 * @param {object}   payload
 */
export const pushEvent = (userIds, eventName, payload) => {
  const data = JSON.stringify({ event: eventName, ...payload });
  const eventId = Date.now();
  for (const uid of userIds) {
    const connections = clients.get(uid);
    if (!connections) continue;
    for (const res of connections) {
      try {
        // Named events let browsers send Last-Event-ID on reconnect (critical for proxied SSE)
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

  // SSE headers - Hardened for production proxies (Nginx, Cloudflare, Load Balancers)
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
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, ts: Date.now() })}\n\n`);

  addClient(userId, res);

  logger.info('sse_connected', {
    timestamp: new Date().toISOString(),
    actor: userId,
    action: 'SSE_CONNECT',
    resource_id: null,
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
