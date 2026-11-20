import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './logger.js';

let wss = null;

export function initWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    logger.info(`WebSocket client connected from ${ip}`);

    // Send initial connection acknowledgement
    ws.send(
      JSON.stringify({
        type: 'CONNECTED',
        message: 'Connected to HemoSync live dashboard stream',
        timestamp: new Date().toISOString()
      })
    );

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch (e) {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      logger.warn(`WebSocket error: ${err.message}`);
    });
  });

  return wss;
}

export function broadcastWsEvent(type, payload = {}) {
  if (!wss) return;

  const data = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString()
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (err) {
        logger.warn(`Failed to send WebSocket message: ${err.message}`);
      }
    }
  }
}

export function getConnectedClientCount() {
  if (!wss) return 0;
  let count = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) count++;
  }
  return count;
}

