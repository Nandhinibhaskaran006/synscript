require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const passport = require('./config/passport');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const invitationRoutes = require('./routes/invitationRoutes');
const executeRoutes = require('./routes/executeRoutes');
const editorSocket = require('./sockets/editorSocket');
const logger = require('./utils/logger');

// ── Connect to MongoDB ──────────────────────────────────────────
connectDB();

// ── Express App ─────────────────────────────────────────────────
const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// ── HTTP Request Structured Logging ─────────────────────────────
app.use(logger.httpMiddleware);

// ── REST Routes ─────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/execute', executeRoutes);

// ── Health Monitoring ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const uptimeSeconds = process.uptime();
  const formattedUptime =
    uptimeSeconds > 3600
      ? `${(uptimeSeconds / 3600).toFixed(2)}h`
      : uptimeSeconds > 60
      ? `${(uptimeSeconds / 60).toFixed(2)}m`
      : `${uptimeSeconds.toFixed(2)}s`;

  res.status(isDbConnected ? 200 : 503).json({
    status: isDbConnected ? 'ok' : 'degraded',
    database: isDbConnected ? 'connected' : 'disconnected',
    uptime: formattedUptime,
    environment: process.env.NODE_ENV || 'development',
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn('ROUTER', `404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('SERVER', `Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`, {
    stack: err.stack,
  });
  res.status(500).json({ message: err.message || 'Internal Server Error' });
});

// ── HTTP + Socket.io Server ─────────────────────────────────────
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 10000,
  pingInterval: 5000,
});

editorSocket(io);

// ── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  logger.info('SERVER', `🚀 SynScript Backend Server running on http://localhost:${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
  });
});
