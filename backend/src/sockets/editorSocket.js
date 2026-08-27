const jwt = require('jsonwebtoken');
const Room = require('../models/Room');
const ChatMessage = require('../models/ChatMessage');

// In-memory store: roomId -> Map<socketId, { userId, username }>
const roomUsers = {};

const editorSocket = (io) => {
  // Socket.io JWT auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: No token'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.userId})`);

    // ─── join-room ───────────────────────────────────────────────
    socket.on('join-room', async ({ roomId, username }) => {
      try {
        const room = await Room.findOne({ roomId });
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        socket.join(roomId);

        // Track user in room
        if (!roomUsers[roomId]) roomUsers[roomId] = new Map();
        roomUsers[roomId].set(socket.id, { userId: socket.userId, username });
        socket.currentRoom = roomId;
        socket.username = username;

        const usersInRoom = Array.from(roomUsers[roomId].values());

        // Notify others that a new user joined
        socket.to(roomId).emit('user-joined', { username, userId: socket.userId });

        // Send current code and user list to the newly joined socket
        socket.emit('room-users', usersInRoom);
        socket.emit('receive-code-change', { code: room.currentCode });
        socket.emit('room-joined', { roomId });

        console.log(`👤 ${username} joined room: ${roomId}`);
      } catch (err) {
        console.error('join-room error:', err.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ─── code-change ─────────────────────────────────────────────
    socket.on('code-change', async ({ roomId, code }) => {
      try {
        // Broadcast to everyone else in the room
        socket.to(roomId).emit('receive-code-change', { code });

        // Persist latest code to DB (debounced on client is ideal, but we save every change)
        await Room.findOneAndUpdate({ roomId }, { currentCode: code });
      } catch (err) {
        console.error('code-change error:', err.message);
      }
    });

    // ─── send-message ─────────────────────────────────────────────
    socket.on('send-message', async ({ roomId, message }) => {
      try {
        if (!message || !message.trim()) return;

        const username = socket.username || 'Anonymous';

        // Persist to DB
        const saved = await ChatMessage.create({
          roomId,
          sender: socket.userId,
          senderName: username,
          message: message.trim(),
        });

        const payload = {
          _id: saved._id,
          senderName: username,
          message: saved.message,
          createdAt: saved.createdAt,
        };

        // Broadcast to ALL users in room (including sender)
        io.to(roomId).emit('receive-message', payload);
      } catch (err) {
        console.error('send-message error:', err.message);
      }
    });

    // ─── disconnect ───────────────────────────────────────────────
    socket.on('disconnect', () => {
      const roomId = socket.currentRoom;
      if (roomId && roomUsers[roomId]) {
        roomUsers[roomId].delete(socket.id);

        const usersInRoom = Array.from(roomUsers[roomId].values());

        // Notify remaining users
        socket.to(roomId).emit('user-left', {
          username: socket.username,
          userId: socket.userId,
        });
        io.to(roomId).emit('room-users', usersInRoom);

        if (roomUsers[roomId].size === 0) {
          delete roomUsers[roomId];
        }
      }
      console.log(`❌ Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = editorSocket;
