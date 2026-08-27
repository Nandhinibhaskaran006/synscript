const express = require('express');
const router = express.Router();
const {
  sendInvitation,
  getInvitation,
  acceptInvitation,
  declineInvitation,
} = require('../controllers/invitationController');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/invitations/send
router.post('/send', protect, sendInvitation);

// @route   GET /api/invitations/:token
router.get('/:token', getInvitation);

// @route   POST /api/invitations/accept
router.post('/accept', protect, acceptInvitation);

// @route   POST /api/invitations/decline
router.post('/decline', declineInvitation);

module.exports = router;
