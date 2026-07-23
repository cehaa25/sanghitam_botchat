// WebSocket + WebRTC signaling server
// Runs locally with `node server.js` or on Vercel via serverless function
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ---------- HTTP server (serves index.html locally) ----------
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const file = path.join(__dirname, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(500); res.end('Error'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ---------- WebSocket server ----------
const wss = new WebSocketServer({ server });

// rooms[roomName] = Map<clientId, { ws, name }>
const rooms = new Map();

function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, new Map());
  return rooms.get(name);
}

function broadcast(room, msg, exceptId) {
  const r = getRoom(room);
  const payload = JSON.stringify(msg);
  for (const [id, client] of r) {
    if (id !== exceptId && client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  }
}

function sendTo(room, toId, msg) {
  const r = getRoom(room);
  const client = r.get(toId);
  if (client && client.ws.readyState === 1) {
    client.ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', ws => {
  let clientId = null;
  let clientRoom = null;
  let clientName = null;

  ws.on('message', raw => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    switch (data.type) {
      case 'join': {
        clientId = data.id;
        clientRoom = data.room;
        clientName = data.name;
        const room = getRoom(clientRoom);
        room.set(clientId, { ws, name: clientName });
        // Notify others
        broadcast(clientRoom, { type: 'join', name: clientName, id: clientId }, clientId);
        break;
      }
      case 'text':
      case 'media':
      case 'voice': {
        // Broadcast to room
        broadcast(data.room, data);
        break;
      }
      case 'call-offer': {
        // Broadcast offer to room (first free peer picks it up)
        broadcast(data.room, data, data.from);
        break;
      }
      case 'call-answer':
      case 'call-ice':
      case 'call-end': {
        // Targeted delivery
        sendTo(data.room, data.to, data);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (clientId && clientRoom) {
      const room = getRoom(clientRoom);
      room.delete(clientId);
      broadcast(clientRoom, { type: 'leave', name: clientName, id: clientId });
      if (room.size === 0) rooms.delete(clientRoom);
    }
  });

  ws.on('error', err => console.error('ws error', err.message));
});

server.listen(PORT, () => {
  console.log(`🏰 Pitch Black Chat running on http://localhost:${PORT}`);
});
