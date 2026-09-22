const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Room = require('../models/Room');
const ChatMessage = require('../models/ChatMessage');
const { upsertRoomFileContent } = require('../utils/roomFiles');
const terminalWorkspaceService = require('../services/terminalWorkspaceService');
const workspaceWatcherService = require('../services/workspaceWatcherService');
const logger = require('../utils/logger');

// In-memory store: roomId -> Map<userIdStr, { userId, username, avatar, socketIds: Set<socketId> }>
const roomUsers = {};

function parseRoomPayload(payload) {
  if (typeof payload === 'string') return payload;
  return payload?.roomId;
}

function getRoomUsers(roomId) {
  if (!roomUsers[roomId]) return [];
  return Array.from(roomUsers[roomId].values()).map((u) => ({
    userId: u.userId,
    username: u.username,
    avatar: u.avatar || '',
  }));
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
  const users = getRoomUsers(roomId);
  const count = users.length;
  console.log('📡 broadcastOnlineCount', { roomId, count, users });
  io.to(roomId).emit('ONLINE_COUNT', { count });
  io.to(roomId).emit('room-users', users);
  io.to(roomId).emit('ONLINE_USERS', users);
}

function addSocketToRoom(io, socket, roomId, username, avatar) {
  if (socket.currentRoom && socket.currentRoom !== roomId) {
    removeSocketFromRoom(io, socket, socket.currentRoom);
  }

  socket.join(roomId);
  socket.currentRoom = roomId;
  socket.username = username;

  if (!roomUsers[roomId]) {
    roomUsers[roomId] = new Map();
  }

  const userIdStr = String(socket.userId);
  const userEntry = roomUsers[roomId].get(userIdStr);
  const isNewUser = !userEntry || userEntry.socketIds.size === 0;

  if (userEntry) {
    userEntry.socketIds.add(socket.id);
    userEntry.username = username || userEntry.username;
    if (avatar) userEntry.avatar = avatar;
  } else {
    roomUsers[roomId].set(userIdStr, {
      userId: userIdStr,
      username,
      avatar: avatar || socket.avatar || '',
      socketIds: new Set([socket.id]),
    });
  }

  if (isNewUser) {
    socket.to(roomId).emit('USER_JOINED', { userId: userIdStr, username });
  }

  broadcastOnlineCount(io, roomId);
}

function removeSocketFromRoom(io, socket, roomId) {
  if (!roomId) return;
  socket.leave(roomId);
  if (socket.currentRoom === roomId) {
    socket.currentRoom = null;
  }

  if (roomUsers[roomId]) {
    const userIdStr = String(socket.userId);
    const userEntry = roomUsers[roomId].get(userIdStr);
    if (userEntry) {
      userEntry.socketIds.delete(socket.id);
      if (userEntry.socketIds.size === 0) {
        roomUsers[roomId].delete(userIdStr);
        socket.to(roomId).emit('USER_LEFT', {
          userId: userIdStr,
          username: socket.username || userEntry.username,
        });
      }
    }

    if (roomUsers[roomId].size === 0) {
      delete roomUsers[roomId];
      workspaceWatcherService.stopWatching(roomId);
    }
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
    logger.socketConnect(socket.id, socket.userId, socket.username);

    // ─── JOIN_ROOM ───────────────────────────────────────────────
    socket.on('JOIN_ROOM', async (payload) => {
      try {
        const roomId = parseRoomPayload(payload);
        const username =
          (typeof payload === 'object' && payload?.username) ||
          socket.handshake.auth?.username ||
          socket.username ||
          'Anonymous';

        logger.roomEvent('JOIN_ROOM', roomId, socket.userId, username, { socketId: socket.id });

        if (!roomId) {
          socket.emit('error', { message: 'Room ID is required' });
          return;
        }

        const room = await Room.findOne({ roomId }).select('_id name').lean();
        if (!room) {
          logger.warn('ROOM', `Room not found for JOIN_ROOM: ${roomId}`, { userId: socket.userId });
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        addSocketToRoom(io, socket, roomId, username, socket.avatar);

        // Start watching room workspace and sync DB files to disk in background
        workspaceWatcherService.syncDatabaseFilesToDisk(roomId).then(() => {
          workspaceWatcherService.startWatching(roomId, io);
        }).catch((err) => {
          logger.warn('WATCHER', `Async watcher init error: ${err.message}`);
        });

        // Send current room users to the joining socket so they know who is online
        const currentUsers = getRoomUsers(roomId);
        socket.emit('ONLINE_USERS', currentUsers);
        socket.emit('room-joined', { roomId });
      } catch (err) {
        logger.error('ROOM', `JOIN_ROOM error: ${err.message}`, { roomId: parseRoomPayload(payload), stack: err.stack });
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ─── join-room (legacy) ──────────────────────────────────────
    socket.on('join-room', async ({ roomId, username }) => {
      try {
        const room = await Room.findOne({ roomId }).select('_id currentCode').lean();
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        addSocketToRoom(io, socket, roomId, username, socket.avatar);

        workspaceWatcherService.syncDatabaseFilesToDisk(roomId).then(() => {
          workspaceWatcherService.startWatching(roomId, io);
        }).catch((err) => {
          logger.warn('WATCHER', `Async watcher init error: ${err.message}`);
        });

        const currentUsers = getRoomUsers(roomId);
        socket.emit('ONLINE_USERS', currentUsers);
        socket.emit('receive-code-change', { code: room.currentCode || '' });
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
        workspaceWatcherService.writeFileFromEditor(roomId, filePath, content);
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
        workspaceWatcherService.createItemFromEditor(roomId, file);
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
        workspaceWatcherService.renameItemOnDisk(roomId, oldPath, newPath);
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
        workspaceWatcherService.deleteItemFromDisk(roomId, path);
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
        workspaceWatcherService.createItemFromEditor(roomId, folder);
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
        workspaceWatcherService.renameItemOnDisk(roomId, oldPath, newPath);
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
        workspaceWatcherService.deleteItemFromDisk(roomId, path);
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

    // ─── TERMINAL EVENTS ─────────────────────────────────────────
    socket.on('terminal:start', async (payload = {}) => {
      const terminalId = payload.terminalId ? String(payload.terminalId) : '1';
      try {
        const roomId = parseRoomPayload(payload) || socket.currentRoom;
        if (!roomId) {
          socket.emit('terminal:output', {
            terminalId,
            data: '\r\n\x1b[31m[Error: Room ID required to initialize terminal]\x1b[0m\r\n',
          });
          return;
        }

        logger.info('TERMINAL', `Starting terminal session for socket ${socket.id} (tab: ${terminalId}) in room ${roomId}`);
        await terminalWorkspaceService.startTerminal(socket, roomId, {
          terminalId,
          cols: payload.cols,
          rows: payload.rows,
          roomName: payload.roomName,
        });
      } catch (err) {
        logger.error('TERMINAL', `terminal:start error: ${err.message}`, { socketId: socket.id, terminalId, stack: err.stack });
        socket.emit('terminal:output', {
          terminalId,
          data: `\r\n\x1b[31m[Terminal Error: ${err.message}]\x1b[0m\r\n`,
        });
      }
    });

    socket.on('terminal:input', ({ terminalId, data } = {}) => {
      try {
        terminalWorkspaceService.handleInput(socket.id, terminalId || '1', data);
      } catch (err) {
        logger.error('TERMINAL', `terminal:input error: ${err.message}`, { socketId: socket.id, terminalId });
      }
    });

    socket.on('terminal:resize', ({ terminalId, cols, rows } = {}) => {
      try {
        terminalWorkspaceService.handleResize(socket.id, terminalId || '1', cols, rows);
      } catch (err) {
        logger.error('TERMINAL', `terminal:resize error: ${err.message}`, { socketId: socket.id, terminalId });
      }
    });

    socket.on('terminal:close', ({ terminalId } = {}) => {
      try {
        terminalWorkspaceService.closeTerminal(socket.id, terminalId);
      } catch (err) {
        logger.error('TERMINAL', `terminal:close error: ${err.message}`, { socketId: socket.id, terminalId });
      }
    });

    // ─── LEAVE_ROOM ──────────────────────────────────────────────
    socket.on('LEAVE_ROOM', async (payload) => {
      const roomId = parseRoomPayload(payload) || socket.currentRoom;
      terminalWorkspaceService.closeTerminal(socket.id);
      if (!roomId) return;
      await flushRoomPersists(roomId);
      logger.roomEvent('LEAVE_ROOM', roomId, socket.userId, socket.username);
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

        logger.roomEvent('CHAT_MESSAGE', roomId, senderId, senderUsername, { messageId: saved._id });

        // Broadcast to ALL users in room (including sender)
        io.to(roomId).emit('receive-message', payload);
      } catch (err) {
        logger.error('CHAT', `send-message error: ${err.message}`, { roomId, stack: err.stack });
      }
    });

    // ─── disconnecting ────────────────────────────────────────────
    socket.on('disconnecting', () => {
      terminalWorkspaceService.closeTerminal(socket.id);
      for (const r of socket.rooms) {
        if (r !== socket.id) {
          removeSocketFromRoom(io, socket, r);
        }
      }
    });

    // ─── disconnect ───────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      const roomId = socket.currentRoom;
      terminalWorkspaceService.closeTerminal(socket.id);
      logger.socketDisconnect(socket.id, socket.userId, reason);
      if (roomId) {
        await flushRoomPersists(roomId);
        logger.roomEvent('USER_LEFT_DISCONNECT', roomId, socket.userId, socket.username);
        removeSocketFromRoom(io, socket, roomId);
      }
    });
  });
};

module.exports = editorSocket;
