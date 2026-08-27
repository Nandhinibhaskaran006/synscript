const express = require('express');
const router = express.Router();
const { register, login, getMe, updateMe, getMyStats, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/auth/register
router.post('/register', register);

// @route   POST /api/auth/login
router.post('/login', login);

// @route   POST /api/auth/forgot-password
router.post('/forgot-password', forgotPassword);

// @route   POST /api/auth/reset-password
router.post('/reset-password', resetPassword);

// @route   GET /api/auth/me
router.get('/me', protect, getMe);

// @route   GET /api/auth/me/stats
router.get('/me/stats', protect, getMyStats);

// @route   PUT /api/auth/me
router.put('/me', protect, updateMe);

module.exports = router;
