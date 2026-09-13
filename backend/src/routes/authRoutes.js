const express = require('express');
const router = express.Router();
const passport = require('passport');
const {
  register,
  login,
  getMe,
  updateMe,
  getMyStats,
  forgotPassword,
  resetPassword,
  generateToken,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';

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

// ── Google OAuth Routes ───────────────────────────────────────────
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${frontendUrl}/login?error=Google+OAuth+is+not+configured.+Please+set+GOOGLE_CLIENT_ID+and+GOOGLE_CLIENT_SECRET.`);
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

router.get(
  '/google/callback',
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect(`${frontendUrl}/login?error=Google+OAuth+is+not+configured.`);
    }
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${frontendUrl}/login?error=Google+authentication+failed`,
    })(req, res, next);
  },
  (req, res) => {
    try {
      const token = generateToken(req.user._id);
      res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    } catch (err) {
      console.error('Google callback error:', err);
      res.redirect(`${frontendUrl}/login?error=Authentication+token+generation+failed`);
    }
  }
);

// ── GitHub OAuth Routes ───────────────────────────────────────────
router.get('/github', (req, res, next) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return res.redirect(`${frontendUrl}/login?error=GitHub+OAuth+is+not+configured.+Please+set+GITHUB_CLIENT_ID+and+GITHUB_CLIENT_SECRET.`);
  }
  passport.authenticate('github', { scope: ['user:email'], session: false })(req, res, next);
});

router.get(
  '/github/callback',
  (req, res, next) => {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      return res.redirect(`${frontendUrl}/login?error=GitHub+OAuth+is+not+configured.`);
    }
    passport.authenticate('github', {
      session: false,
      failureRedirect: `${frontendUrl}/login?error=GitHub+authentication+failed`,
    })(req, res, next);
  },
  (req, res) => {
    try {
      const token = generateToken(req.user._id);
      res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    } catch (err) {
      console.error('GitHub callback error:', err);
      res.redirect(`${frontendUrl}/login?error=Authentication+token+generation+failed`);
    }
  }
);

module.exports = router;
