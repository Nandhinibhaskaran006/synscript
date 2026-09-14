const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Room = require('../models/Room');
const ChatMessage = require('../models/ChatMessage');
const { upsertRoomFileContent } = require('../utils/roomFiles');

// In-memory store: roomId -> Map<socketId, { userId, username }>
const roomUsers = {};

function parseRoomPayload(payload) {
  if (typeof payload === 'string') return payload;
  return payload?.roomId;
}

function getRoomUserCount(roomId) {
  return roomUsers[roomId]?.size ?? 0;
}

const pendingFileSaves = new Map();

function scheduleFilePersist(roomId, filePath, content) {
  const key = `${roomId}::${filePath}`;
  const existing = pendingFileSaves.get(key);
  if (existing?.timer) clearTimeout(existing.timer);

  const timer = setTimeout(async () => {
    pendingFileSaves.delete(key);
    try {
      await upsertRoomFileContent(roomId, filePath, content);
    } catch (err) {
      console.error('persist CODE_CHANGE error:', err.message);
    }
  }, 400);

  pendingFileSaves.set(key, { timer, roomId, filePath, content });
}

async function flushRoomPersists(roomId) {
  const keys = [...pendingFileSaves.keys()].filter((k) => k.startsWith(`${roomId}::`));
  await Promise.all(
    keys.map(async (key) => {
      const pending = pendingFileSaves.get(key);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingFileSaves.delete(key);
      try {
        await upsertRoomFileContent(pending.roomId, pending.filePath, pending.content);
      } catch (err) {
        console.error('flush persist error:', err.message);
      }
    }),
  );
}

function broadcastOnlineCount(io, roomId) {
  const count = getRoomUserCount(roomId);
  const users = Array.from(roomUsers[roomId]?.values() ?? []);
  console.log('📡 broadcastOnlineCount', { roomId, count, users });
  io.to(roomId).emit('ONLINE_COUNT', { count });
  io.to(roomId).emit('room-users', users);
}

function addSocketToRoom(socket, roomId, username) {
  socket.join(roomId);
  if (!roomUsers[roomId]) roomUsers[roomId] = new Map();
  roomUsers[roomId].set(socket.id, { userId: socket.userId, username });
  socket.currentRoom = roomId;
  socket.username = username;
}

function removeSocketFromRoom(io, socket, roomId) {
  if (!roomId) return;
  socket.leave(roomId);
  if (roomUsers[roomId]) {
    roomUsers[roomId].delete(socket.id);
    if (roomUsers[roomId].size === 0) {
      delete roomUsers[roomId];
    }
  }
  if (socket.currentRoom === roomId) {
    socket.currentRoom = null;
  }
  broadcastOnlineCount(io, roomId);
}

const editorSocket = (io) => {
  // Socket.io JWT auth middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: No token'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;

      const user = await User.findById(decoded.id).select('username email avatar');
      if (user) {
        socket.user = user;
        socket.username = user.username;
        socket.avatar = user.avatar || '';
      } else {
        socket.username = socket.handshake.auth?.username || 'Collaborator';
        socket.avatar = '';
      }
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.userId})`);

    // ─── JOIN_ROOM ───────────────────────────────────────────────
    socket.on('JOIN_ROOM', async (payload) => {
      try {
        const roomId = parseRoomPayload(payload);
        const username =
          (typeof payload === 'object' && payload?.username) ||
          socket.handshake.auth?.username ||
          socket.username ||
          'Anonymous';

        console.log('JOIN_ROOM', { roomId, username, socketId: socket.id });

        if (!roomId) {
          socket.emit('error', { message: 'Room ID is required' });
          return;
        }

        const room = await Room.findOne({ roomId });
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        addSocketToRoom(socket, roomId, username);
        console.log('🔔 Emitting USER_JOINED', { userId: socket.userId, username, roomId });
        socket.to(roomId).emit('USER_JOINED', { userId: socket.userId, username });
        broadcastOnlineCount(io, roomId);
        // Send current room users to the joining socket so they know who is online
        const currentUsers = Array.from(roomUsers[roomId]?.values() ?? []);
        socket.emit('ONLINE_USERS', currentUsers);
        socket.emit('room-joined', { roomId });
      } catch (err) {
        console.error('JOIN_ROOM error:', err.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ─── join-room (legacy) ──────────────────────────────────────
    socket.on('join-room', async ({ roomId, username }) => {
      try {
        const room = await Room.findOne({ roomId });
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        addSocketToRoom(socket, roomId, username);

        socket.to(roomId).emit('USER_JOINED', { userId: socket.userId, username });
        broadcastOnlineCount(io, roomId);
        // Send current room users to the joining socket so they know who is online
        const currentUsers = Array.from(roomUsers[roomId]?.values() ?? []);
        socket.emit('ONLINE_USERS', currentUsers);
        socket.emit('receive-code-change', { code: room.currentCode });
        socket.emit('room-joined', { roomId });

        console.log(`👤 ${username} joined room: ${roomId}`);
      } catch (err) {
        console.error('join-room error:', err.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ─── CODE_CHANGE ─────────────────────────────────────────────
    socket.on('CODE_CHANGE', ({ roomId, filePath, content }) => {
      try {
        console.log(`CODE_CHANGE roomId=${roomId} filePath=${filePath} contentLen=${typeof content === 'string' ? content.length : 0} socketId=${socket.id}`);

        if (!roomId || !filePath) return;

        socket.to(roomId).emit('CODE_UPDATE', { filePath, content });
        console.log(`CODE_UPDATE roomId=${roomId} filePath=${filePath}`);
        scheduleFilePersist(roomId, filePath, content);
      } catch (err) {
        console.error('CODE_CHANGE error:', err.message);
      }
    });

    // ─── FILE_CREATED ─────────────────────────────────────────────
    socket.on('FILE_CREATED', ({ roomId, file }) => {
      try {
        console.log('FILE_CREATED', { roomId, file, socketId: socket.id });
        if (!roomId || !file) return;
        socket.to(roomId).emit('FILE_CREATED', { file });
      } catch (err) {
        console.error('FILE_CREATED error:', err.message);
      }
    });

    // ─── FILE_RENAMED ─────────────────────────────────────────────
    socket.on('FILE_RENAMED', ({ roomId, oldPath, newPath, newName }) => {
      try {
        console.log('FILE_RENAMED', { roomId, oldPath, newPath, newName, socketId: socket.id });
        if (!roomId || !oldPath || !newPath) return;
        socket.to(roomId).emit('FILE_RENAMED', { oldPath, newPath, newName });
      } catch (err) {
        console.error('FILE_RENAMED error:', err.message);
      }
    });

    // ─── FILE_DELETED ─────────────────────────────────────────────
    socket.on('FILE_DELETED', ({ roomId, path }) => {
      try {
        console.log('FILE_DELETED', { roomId, path, socketId: socket.id });
        if (!roomId || !path) return;
        socket.to(roomId).emit('FILE_DELETED', { path });
      } catch (err) {
        console.error('FILE_DELETED error:', err.message);
      }
    });

    // ─── FOLDER_CREATED ───────────────────────────────────────────
    socket.on('FOLDER_CREATED', ({ roomId, folder }) => {
      try {
        console.log('FOLDER_CREATED', { roomId, folder, socketId: socket.id });
        if (!roomId || !folder) return;
        socket.to(roomId).emit('FOLDER_CREATED', { folder });
      } catch (err) {
        console.error('FOLDER_CREATED error:', err.message);
      }
    });

    // ─── FOLDER_RENAMED ───────────────────────────────────────────
    socket.on('FOLDER_RENAMED', ({ roomId, oldPath, newPath, newName }) => {
      try {
        console.log('FOLDER_RENAMED', { roomId, oldPath, newPath, newName, socketId: socket.id });
        if (!roomId || !oldPath || !newPath) return;
        socket.to(roomId).emit('FOLDER_RENAMED', { oldPath, newPath, newName });
      } catch (err) {
        console.error('FOLDER_RENAMED error:', err.message);
      }
    });

    // ─── FOLDER_DELETED ───────────────────────────────────────────
    socket.on('FOLDER_DELETED', ({ roomId, path }) => {
      try {
        console.log('FOLDER_DELETED', { roomId, path, socketId: socket.id });
        if (!roomId || !path) return;
        socket.to(roomId).emit('FOLDER_DELETED', { path });
      } catch (err) {
        console.error('FOLDER_DELETED error:', err.message);
      }
    });

    // ─── CURSOR_MOVE ─────────────────────────────────────────────
    socket.on('CURSOR_MOVE', ({ roomId, filePath, position }) => {
      try {
        console.log(`CURSOR_MOVE roomId=${roomId} filePath=${filePath} pos=${position?.lineNumber}:${position?.column} socketId=${socket.id} userId=${socket.userId}`);
        if (!roomId || !position) return;
        socket.to(roomId).emit('CURSOR_UPDATE', { 
          userId: socket.userId,
          filePath,
          position 
        });
      } catch (err) {
        console.error('CURSOR_MOVE error:', err.message);
      }
    });

    // ─── code-change (legacy) ────────────────────────────────────
    socket.on('code-change', async ({ roomId, code }) => {
      try {
        socket.to(roomId).emit('receive-code-change', { code });
        await Room.findOneAndUpdate({ roomId }, { currentCode: code });
      } catch (err) {
        console.error('code-change error:', err.message);
      }
    });

    // ─── LEAVE_ROOM ──────────────────────────────────────────────
    socket.on('LEAVE_ROOM', async (payload) => {
      const roomId = parseRoomPayload(payload) || socket.currentRoom;
      if (!roomId) return;
      await flushRoomPersists(roomId);
      console.log('🔔 Emitting USER_LEFT', { userId: socket.userId, username: socket.username, roomId });
      socket.to(roomId).emit('USER_LEFT', {
        userId: socket.userId,
        username: socket.username,
      });
      removeSocketFromRoom(io, socket, roomId);
    });

    // ─── send-message ─────────────────────────────────────────────
    socket.on('send-message', async ({ roomId, message }) => {
      try {
        if (!message || !message.trim()) return;

        let user = socket.user;
        if (!user && socket.userId) {
          user = await User.findById(socket.userId).select('username email avatar');
        }

        const senderId = socket.userId ? socket.userId.toString() : '';
        const senderUsername = user?.username || socket.username || socket.handshake.auth?.username || 'Collaborator';
        const senderAvatar = user?.avatar || socket.avatar || '';

        // Persist to DB
        const saved = await ChatMessage.create({
          roomId,
          sender: socket.userId,
          senderId,
          senderUsername,
          senderName: senderUsername,
          senderAvatar,
          message: message.trim(),
        });

        const payload = {
          _id: saved._id,
          roomId: saved.roomId,
          sender: senderId,
          senderId,
          userId: senderId,
          senderUsername,
          username: senderUsername,
          senderName: senderUsername,
          senderAvatar,
          avatar: senderAvatar,
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
    socket.on('disconnect', async () => {
      const roomId = socket.currentRoom;
      console.log('DISCONNECT', { socketId: socket.id, roomId, userId: socket.userId });
      if (roomId) {
        await flushRoomPersists(roomId);
        console.log('🔔 Emitting USER_LEFT (disconnect)', { userId: socket.userId, username: socket.username, roomId });
        socket.to(roomId).emit('USER_LEFT', {
          userId: socket.userId,
          username: socket.username,
        });
        removeSocketFromRoom(io, socket, roomId);
      }
    });
  });
};

module.exports = editorSocket;
