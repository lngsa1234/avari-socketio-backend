// server.js - Avari Production Backend with Socket.IO
// Standalone project - separate from Coffee Chat

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ================================================
// CONFIGURATION
// ================================================

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.AVARI_FRONTEND_URL || 'http://localhost:3000';

// CORS configuration
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST']
}));

app.use(express.json());
app.use(express.static('public'));

// ================================================
// SOCKET.IO INITIALIZATION
// ================================================

const io = socketIO(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// ================================================
// STATE MANAGEMENT
// ================================================

// Store active matches and their participants
const matches = new Map(); // matchId -> Set of socket objects
const userSockets = new Map(); // userId -> socket object
const socketToUser = new Map(); // socketId -> userId

// Match metadata
const matchMetadata = new Map(); // matchId -> { createdAt, lastActivity }

// Deepgram transcription connections
const deepgramConnections = new Map(); // socketId -> WebSocket instance

// ================================================
// HTTP ENDPOINTS
// ================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Avari',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    stats: {
      activeMatches: matches.size,
      connectedUsers: userSockets.size,
      totalConnections: io.engine.clientsCount
    }
  });
});

// Detailed stats
app.get('/api/stats', (req, res) => {
  const matchDetails = Array.from(matches.entries()).map(([matchId, sockets]) => {
    const users = Array.from(sockets).map(socket => ({
      userId: socket.userId,
      connected: socket.connected
    }));
    const metadata = matchMetadata.get(matchId);
    
    return {
      matchId,
      participantCount: sockets.size,
      participants: users,
      createdAt: metadata?.createdAt,
      lastActivity: metadata?.lastActivity
    };
  });

  res.json({
    activeMatches: matches.size,
    connectedUsers: userSockets.size,
    totalSockets: io.engine.clientsCount,
    matches: matchDetails,
    timestamp: new Date().toISOString()
  });
});

// TURN/STUN server configuration
app.get('/api/ice-servers', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  // Metered.ca TURN servers
  if (process.env.METERED_USERNAME && process.env.METERED_CREDENTIAL) {
    iceServers.push(
      {
        urls: 'turn:a.relay.metered.ca:80',
        username: process.env.METERED_USERNAME,
        credential: process.env.METERED_CREDENTIAL,
      },
      {
        urls: 'turn:a.relay.metered.ca:80?transport=tcp',
        username: process.env.METERED_USERNAME,
        credential: process.env.METERED_CREDENTIAL,
      },
      {
        urls: 'turn:a.relay.metered.ca:443',
        username: process.env.METERED_USERNAME,
        credential: process.env.METERED_CREDENTIAL,
      },
      {
        urls: 'turn:a.relay.metered.ca:443?transport=tcp',
        username: process.env.METERED_USERNAME,
        credential: process.env.METERED_CREDENTIAL,
      }
    );
  }
  // Custom TURN server
  else if (process.env.TURN_SERVER_URL) {
    iceServers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || ''
    });
  }

  res.json({ iceServers });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    app: 'Avari Backend',
    version: '1.0.0',
    description: 'WebRTC signaling server for Avari video calling',
    endpoints: {
      health: '/health',
      stats: '/api/stats',
      iceServers: '/api/ice-servers'
    }
  });
});

// ================================================
// SOCKET.IO CONNECTION HANDLING
// ================================================

io.on('connection', (socket) => {
  console.log(`[Avari] New connection: ${socket.id}`);

  // ================================================
  // AUTHENTICATION & REGISTRATION
  // ================================================

  socket.on('register', ({ userId, matchId }) => {
    try {
      if (!userId || !matchId) {
        socket.emit('error', { 
          type: 'validation', 
          message: 'Missing userId or matchId' 
        });
        return;
      }

      // Store user info on socket
      socket.userId = userId;
      socket.matchId = matchId;

      // Store in maps
      userSockets.set(userId, socket);
      socketToUser.set(socket.id, userId);

      // Initialize match if it doesn't exist
      if (!matches.has(matchId)) {
        matches.set(matchId, new Set());
        matchMetadata.set(matchId, {
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        });
      }

      const match = matches.get(matchId);

      // Check if match is full (2 people max for 1:1 calls)
      if (match.size >= 2 && !match.has(socket)) {
        socket.emit('error', { 
          type: 'match_full', 
          message: 'This match already has 2 participants' 
        });
        return;
      }

      // Add to match
      match.add(socket);
      socket.join(matchId);

      // Update activity
      matchMetadata.get(matchId).lastActivity = new Date().toISOString();

      // Get participant list
      const participants = Array.from(match).map(s => s.userId);

      console.log(`[Avari] User ${userId} joined match ${matchId}`);
      console.log(`[Avari] Match ${matchId} participants: ${participants.join(', ')}`);

      // Notify user they joined successfully
      socket.emit('joined', {
        matchId,
        userId,
        participants,
        participantCount: match.size
      });

      // Notify other participants
      socket.to(matchId).emit('user-joined', { 
        userId,
        participantCount: match.size 
      });

    } catch (error) {
      console.error('[Avari] Error in register:', error);
      socket.emit('error', { 
        type: 'server_error', 
        message: 'Failed to register' 
      });
    }
  });

  // ================================================
  // CALL CONTROL
  // ================================================

  socket.on('initiate-call', ({ to }) => {
    try {
      console.log(`[Avari] Call initiated: ${socket.userId} -> ${to}`);

      const targetSocket = userSockets.get(to);
      if (!targetSocket || !targetSocket.connected) {
        socket.emit('error', { 
          type: 'user_offline', 
          message: 'Target user is not connected' 
        });
        return;
      }

      targetSocket.emit('incoming-call', { 
        from: socket.userId 
      });

      // Update activity
      if (socket.matchId) {
        const metadata = matchMetadata.get(socket.matchId);
        if (metadata) {
          metadata.lastActivity = new Date().toISOString();
        }
      }

    } catch (error) {
      console.error('[Avari] Error in initiate-call:', error);
      socket.emit('error', { 
        type: 'server_error', 
        message: 'Failed to initiate call' 
      });
    }
  });

  socket.on('accept-call', ({ to }) => {
    try {
      console.log(`[Avari] Call accepted: ${socket.userId} -> ${to}`);

      const targetSocket = userSockets.get(to);
      if (targetSocket && targetSocket.connected) {
        targetSocket.emit('call-accepted', { 
          from: socket.userId 
        });
      }

    } catch (error) {
      console.error('[Avari] Error in accept-call:', error);
    }
  });

  socket.on('reject-call', ({ to, reason }) => {
    try {
      console.log(`[Avari] Call rejected: ${socket.userId} -> ${to}`);

      const targetSocket = userSockets.get(to);
      if (targetSocket && targetSocket.connected) {
        targetSocket.emit('call-rejected', { 
          from: socket.userId,
          reason: reason || 'User declined'
        });
      }

    } catch (error) {
      console.error('[Avari] Error in reject-call:', error);
    }
  });

  socket.on('end-call', ({ to }) => {
    try {
      console.log(`[Avari] Call ended by: ${socket.userId}`);

      // Notify specific user if provided
      if (to) {
        const targetSocket = userSockets.get(to);
        if (targetSocket && targetSocket.connected) {
          targetSocket.emit('call-ended', { 
            from: socket.userId 
          });
        }
      }

      // Also notify the entire match
      if (socket.matchId) {
        socket.to(socket.matchId).emit('call-ended', { 
          from: socket.userId 
        });
      }

    } catch (error) {
      console.error('[Avari] Error in end-call:', error);
    }
  });

  // ================================================
  // WEBRTC SIGNALING
  // ================================================

  socket.on('offer', ({ offer, to }) => {
    try {
      console.log(`[Avari] Offer: ${socket.userId} -> ${to}`);

      const targetSocket = userSockets.get(to);
      if (targetSocket && targetSocket.connected) {
        targetSocket.emit('offer', { 
          offer, 
          from: socket.userId 
        });
      } else {
        socket.emit('error', { 
          type: 'user_offline', 
          message: 'Target user not found' 
        });
      }

    } catch (error) {
      console.error('[Avari] Error in offer:', error);
    }
  });

  socket.on('answer', ({ answer, to }) => {
    try {
      console.log(`[Avari] Answer: ${socket.userId} -> ${to}`);

      const targetSocket = userSockets.get(to);
      if (targetSocket && targetSocket.connected) {
        targetSocket.emit('answer', { 
          answer, 
          from: socket.userId 
        });
      }

    } catch (error) {
      console.error('[Avari] Error in answer:', error);
    }
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    try {
      const targetSocket = userSockets.get(to);
      if (targetSocket && targetSocket.connected) {
        targetSocket.emit('ice-candidate', { 
          candidate, 
          from: socket.userId 
        });
      }

    } catch (error) {
      console.error('[Avari] Error in ice-candidate:', error);
    }
  });

  // ================================================
  // DEEPGRAM TRANSCRIPTION PROXY
  // ================================================

  socket.on('transcription:start', ({ language } = {}) => {
    try {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        socket.emit('transcription:error', { message: 'DEEPGRAM_API_KEY not configured on server' });
        return;
      }

      // Close any existing Deepgram connection for this socket
      const existing = deepgramConnections.get(socket.id);
      if (existing) {
        try { existing.close(); } catch (e) { /* ignore */ }
        deepgramConnections.delete(socket.id);
      }

      const lang = language || 'en-US';
      const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=${lang}&punctuate=true&interim_results=true&smart_format=true&encoding=linear16&sample_rate=16000&channels=1`;

      console.log(`[Deepgram] Opening connection for socket ${socket.id}, language: ${lang}`);

      const dgWs = new WebSocket(dgUrl, {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      });

      deepgramConnections.set(socket.id, dgWs);

      dgWs.on('open', () => {
        console.log(`[Deepgram] Connection opened for socket ${socket.id}`);
        socket.emit('transcription:ready');
      });

      dgWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const transcript = msg?.channel?.alternatives?.[0]?.transcript;
          if (!transcript) return;

          socket.emit('transcription:result', {
            text: transcript,
            isFinal: msg.is_final === true,
            timestamp: Date.now(),
          });
        } catch (e) {
          console.warn('[Deepgram] Failed to parse message:', e.message);
        }
      });

      dgWs.on('close', (code, reason) => {
        const reasonStr = reason?.toString() || '';
        console.log(`[Deepgram] Connection closed for socket ${socket.id}, code: ${code}, reason: ${reasonStr}`);
        deepgramConnections.delete(socket.id);
        socket.emit('transcription:closed', { code, reason: reasonStr });
      });

      dgWs.on('error', (err) => {
        console.error(`[Deepgram] WebSocket error for socket ${socket.id}:`, err.message);
        socket.emit('transcription:error', { message: err.message });
      });

    } catch (error) {
      console.error('[Avari] Error in transcription:start:', error);
      socket.emit('transcription:error', { message: 'Failed to start transcription' });
    }
  });

  socket.on('audio-chunk', (data) => {
    const dgWs = deepgramConnections.get(socket.id);
    if (dgWs && dgWs.readyState === WebSocket.OPEN) {
      dgWs.send(Buffer.from(data));
    }
  });

  socket.on('transcription:stop', () => {
    console.log(`[Deepgram] Stop requested for socket ${socket.id}`);
    const dgWs = deepgramConnections.get(socket.id);
    if (dgWs) {
      try { dgWs.close(); } catch (e) { /* ignore */ }
      deepgramConnections.delete(socket.id);
    }
  });

  // ================================================
  // DISCONNECT HANDLING
  // ================================================

  socket.on('disconnect', (reason) => {
    try {
      console.log(`[Avari] Client disconnected: ${socket.id}, reason: ${reason}`);

      // Clean up Deepgram connection
      const dgWs = deepgramConnections.get(socket.id);
      if (dgWs) {
        try { dgWs.close(); } catch (e) { /* ignore */ }
        deepgramConnections.delete(socket.id);
        console.log(`[Deepgram] Cleaned up connection for disconnected socket ${socket.id}`);
      }

      if (socket.userId) {
        // Remove from user maps
        userSockets.delete(socket.userId);
        socketToUser.delete(socket.id);

        // Remove from match
        if (socket.matchId) {
          const match = matches.get(socket.matchId);
          if (match) {
            match.delete(socket);

            // Notify other participants
            socket.to(socket.matchId).emit('user-left', {
              userId: socket.userId
            });

            socket.to(socket.matchId).emit('call-ended', {
              from: socket.userId
            });

            // Clean up empty matches
            if (match.size === 0) {
              matches.delete(socket.matchId);
              matchMetadata.delete(socket.matchId);
              console.log(`[Avari] Cleaned up empty match: ${socket.matchId}`);
            }
          }
        }
      }

    } catch (error) {
      console.error('[Avari] Error in disconnect:', error);
    }
  });

  // ================================================
  // ERROR HANDLING
  // ================================================

  socket.on('error', (error) => {
    console.error(`[Avari] Socket error from ${socket.id}:`, error);
  });
});

// ================================================
// CLEANUP & MONITORING
// ================================================

// Periodic cleanup of stale matches (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const STALE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  for (const [matchId, metadata] of matchMetadata.entries()) {
    const lastActivity = new Date(metadata.lastActivity).getTime();
    if (now - lastActivity > STALE_TIMEOUT) {
      const match = matches.get(matchId);
      if (match && match.size === 0) {
        matches.delete(matchId);
        matchMetadata.delete(matchId);
        console.log(`[Avari] Cleaned up stale match: ${matchId}`);
      }
    }
  }
}, 5 * 60 * 1000);

// ================================================
// SERVER STARTUP
// ================================================

server.listen(PORT, () => {
  console.log('============================================');
  console.log(`🚀 Avari Backend Server`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Frontend: ${FRONTEND_URL}`);
  console.log(`   Protocol: Socket.IO`);
  console.log('============================================');
  console.log('Services:');
  console.log(`   📡 WebRTC Signaling: ✓`);
  console.log(`   🔄 TURN Server: ${process.env.METERED_USERNAME || process.env.TURN_SERVER_URL ? '✓' : '✗'}`);
  console.log(`   🎙️ Deepgram Transcription: ${process.env.DEEPGRAM_API_KEY ? '✓' : '✗'}`);
  console.log(`   🔌 Socket.IO: ✓`);
  console.log('============================================');
  console.log('Endpoints:');
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Stats: http://localhost:${PORT}/api/stats`);
  console.log(`   ICE: http://localhost:${PORT}/api/ice-servers`);
  console.log('============================================');
});

// ================================================
// GRACEFUL SHUTDOWN
// ================================================

const shutdown = async () => {
  console.log('[Avari] Shutting down gracefully...');

  // Notify all connected clients
  io.emit('server-shutdown', { 
    message: 'Server is shutting down' 
  });

  // Close all socket connections
  io.close(() => {
    console.log('[Avari] All socket connections closed');
  });

  // Close HTTP server
  server.close(() => {
    console.log('[Avari] HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('[Avari] Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Avari] Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Avari] Unhandled rejection at:', promise, 'reason:', reason);
});
