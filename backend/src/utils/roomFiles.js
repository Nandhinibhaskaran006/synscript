const Room = require('../models/Room');

function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .filter((f) => f && typeof f.path === 'string' && f.path.trim())
    .map((f) => ({
      path: f.path,
      name: f.name || f.path.split('/').pop(),
      type: f.type === 'folder' ? 'folder' : 'file',
      content: typeof f.content === 'string' ? f.content : '',
      isOpen: f.isOpen !== false,
    }));
}

async function replaceRoomFiles(roomId, files) {
  const room = await Room.findOne({ roomId });
  if (!room) return null;

  const next = normalizeFiles(files);
  room.files = next;

  const lastFile = [...next].reverse().find((f) => f.type === 'file');
  if (lastFile) {
    room.currentCode = lastFile.content;
  }

  room.markModified('files');
  await room.save();
  return room;
}

async function upsertRoomFileContent(roomId, filePath, content) {
  if (!roomId || !filePath) return null;

  const room = await Room.findOne({ roomId });
  if (!room) return null;

  if (!Array.isArray(room.files)) room.files = [];

  const idx = room.files.findIndex((f) => f.path === filePath);
  if (idx >= 0) {
    if (room.files[idx].type === 'folder') return room;
    room.files[idx].content = content ?? '';
  } else {
    room.files.push({
      path: filePath,
      name: filePath.split('/').pop(),
      type: 'file',
      content: content ?? '',
      isOpen: true,
    });
  }

  room.currentCode = content ?? '';
  room.markModified('files');
  await room.save();
  return room;
}

module.exports = { normalizeFiles, replaceRoomFiles, upsertRoomFileContent };
