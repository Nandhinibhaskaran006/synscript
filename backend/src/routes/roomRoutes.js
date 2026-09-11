const express = require('express');
const router = express.Router();
const {
  createRoom,
  joinRoom,
  getRoomDetails,
  saveSession,
  getVersionHistory,
  getUserRooms,
  getSystemStats,
  saveRoomFiles,
  deleteRoom,
} = require('../controllers/roomController');
const { protect } = require('../middleware/authMiddleware');

// All room routes are protected
router.use(protect);

// @route   POST /api/rooms/create
router.post('/create', createRoom);

// @route   POST /api/rooms/join
router.post('/join', joinRoom);

// @route   GET /api/rooms/stats/system
router.get('/stats/system', getSystemStats);

// @route   GET /api/rooms
router.get('/', getUserRooms);

// @route   GET /api/rooms/:roomId
router.get('/:roomId', getRoomDetails);

// @route   DELETE /api/rooms/:roomId
router.delete('/:roomId', deleteRoom);

// @route   PUT /api/rooms/:roomId/files
router.put('/:roomId/files', saveRoomFiles);

// @route   POST /api/rooms/:roomId/save
router.post('/:roomId/save', saveSession);

// @route   GET /api/rooms/:roomId/history
router.get('/:roomId/history', getVersionHistory);

module.exports = router;
