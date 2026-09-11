const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const SessionHistory = require('../models/SessionHistory');
const { replaceRoomFiles } = require('../utils/roomFiles');

// @desc    Create a new room
// @route   POST /api/rooms/create
// @access  Private
const createRoom = async (req, res) => {
  try {
    const { name, language, isPrivate, password } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Room name is required' });
    }

    const roomId = uuidv4();

    const room = await Room.create({
      roomId,
      name,
      owner: req.user._id,
      members: [req.user._id],
      language: language || 'javascript',
      isPrivate: isPrivate || false,
      password: password || '',
      files: [],
      currentCode: '',
    });

    res.status(201).json({
      roomId: room.roomId,
      name: room.name,
      language: room.language,
      isPrivate: room.isPrivate,
      owner: req.user.username,
    });
  } catch (error) {
    console.error('CreateRoom error:', error.message);
    res.status(500).json({ message: 'Server error creating room' });
  }
};

// @desc    Join an existing room
// @route   POST /api/rooms/join
// @access  Private
const joinRoom = async (req, res) => {
  try {
    const { roomId, password } = req.body;

    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required' });
    }

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.isPrivate && room.password && room.password !== password) {
      return res.status(403).json({ message: 'Incorrect room password' });
    }

    // Add user to members if not already present
    if (!room.members.includes(req.user._id)) {
      room.members.push(req.user._id);
      await room.save();
    }

    res.json({
      roomId: room.roomId,
      name: room.name,
      language: room.language,
      currentCode: room.currentCode,
      files: room.files || [],
      isPrivate: room.isPrivate,
    });
  } catch (error) {
    console.error('JoinRoom error:', error.message);
    res.status(500).json({ message: 'Server error joining room' });
  }
};

// @desc    Get room details
// @route   GET /api/rooms/:roomId
// @access  Private
const getRoomDetails = async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
      .populate('owner', 'username email')
      .populate('members', 'username email');

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json(room);
  } catch (error) {
    console.error('GetRoomDetails error:', error.message);
    res.status(500).json({ message: 'Server error fetching room details' });
  }
};

// @desc    Save current code as a session snapshot
// @route   POST /api/rooms/:roomId/save
// @access  Private
const saveSession = async (req, res) => {
  try {
    const { code, language, label } = req.body;
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (Array.isArray(req.body.files)) {
      await replaceRoomFiles(roomId, req.body.files);
    } else {
      room.currentCode = code || room.currentCode;
      if (language) room.language = language;
      await room.save();
    }

    // Create a version snapshot
    const snapshot = await SessionHistory.create({
      roomId,
      savedBy: req.user._id,
      code: code || room.currentCode,
      language: language || room.language,
      label: label || `Snapshot ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}`,
    });

    res.status(201).json({ message: 'Session saved successfully', snapshot });
  } catch (error) {
    console.error('SaveSession error:', error.message);
    res.status(500).json({ message: 'Server error saving session' });
  }
};

// @desc    Get version history for a room
// @route   GET /api/rooms/:roomId/history
// @access  Private
const getVersionHistory = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const history = await SessionHistory.find({ roomId })
      .populate('savedBy', 'username')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(history);
  } catch (error) {
    console.error('GetVersionHistory error:', error.message);
    res.status(500).json({ message: 'Server error fetching history' });
  }
};

// @desc    Get rooms for current user
// @route   GET /api/rooms
// @access  Private
const getUserRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.user._id })
      .populate('owner', 'username email')
      .populate('members', 'username email')
      .sort({ createdAt: -1 });
    res.json(rooms);
  } catch (error) {
    console.error('GetUserRooms error:', error.message);
    res.status(500).json({ message: 'Server error fetching user rooms' });
  }
};

// @desc    Get system wide stats
// @route   GET /api/rooms/stats/system
// @access  Private
const getSystemStats = async (req, res) => {
  try {
    const User = require('../models/User');
    const totalRooms = await Room.countDocuments();
    const totalUsers = await User.countDocuments();
    
    // Simplistic metric for active
    const activeRooms = totalRooms;
    const activeUsers = totalUsers;

    res.json({
      totalRooms,
      activeRooms,
      totalUsers,
      activeUsers
    });
  } catch (error) {
    console.error('GetSystemStats error:', error.message);
    res.status(500).json({ message: 'Server error fetching stats' });
  }
};

// @desc    Persist full room file tree
// @route   PUT /api/rooms/:roomId/files
// @access  Private
const saveRoomFiles = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const updated = await replaceRoomFiles(roomId, req.body.files);
    res.json({ message: 'Files saved', files: updated.files });
  } catch (error) {
    console.error('SaveRoomFiles error:', error.message);
    res.status(500).json({ message: 'Server error saving room files' });
  }
};

module.exports = {
  createRoom,
  joinRoom,
  getRoomDetails,
  saveSession,
  getVersionHistory,
  getUserRooms,
  getSystemStats,
  saveRoomFiles,
};
