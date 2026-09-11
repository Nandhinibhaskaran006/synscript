const express = require('express');
const router = express.Router();
const {
  sendInvitation,
  getInvitation,
  acceptInvitation,
  declineInvitation,
  getReceivedInvitations,
  getSentInvitations,
} = require('../controllers/invitationController');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/invitations/send
router.post('/send', protect, sendInvitation);

// @route   GET /api/invitations/received
router.get('/received', protect, getReceivedInvitations);

// @route   GET /api/invitations/sent
router.get('/sent', protect, getSentInvitations);

// @route   POST /api/invitations/accept
router.post('/accept', protect, acceptInvitation);

// @route   POST /api/invitations/decline
router.post('/decline', declineInvitation);

// @route   GET /api/invitations/:token  (must be LAST — catch-all param)
router.get('/:token', getInvitation);

module.exports = router;
