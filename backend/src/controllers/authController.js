const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please provide username, email and password' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({ message: `${field} already in use` });
    }

    const user = await User.create({ username, email, password });

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar || '',
      githubUrl: user.githubUrl || '',
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar || '',
      githubUrl: user.githubUrl || '',
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// @desc    Get current logged-in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('GetMe error:', error.message);
    res.status(500).json({ message: 'Server error fetching user' });
  }
};

// @desc    Update current logged-in user
// @route   PUT /api/auth/me
// @access  Private
const updateMe = async (req, res) => {
  try {
    const { username, githubUrl, avatar } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (username && username !== user.username) {
      // Check if new username is already taken by someone else
      const existingUser = await User.findOne({ username });
      if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
        return res.status(400).json({ message: 'Username already in use' });
      }
      user.username = username;
    }

    if (avatar !== undefined) {
      user.avatar = avatar ? avatar.trim() : '';
    }

    if (githubUrl !== undefined) {
      user.githubUrl = githubUrl ? githubUrl.trim() : '';
    }

    await user.save();

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar || '',
      githubUrl: user.githubUrl || '',
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('UpdateMe error:', error.message);
    res.status(500).json({ message: 'Server error updating user' });
  }
};

// @desc    Get user stats
// @route   GET /api/auth/me/stats
// @access  Private
const getMyStats = async (req, res) => {
  try {
    const Room = require('../models/Room');
    const SessionHistory = require('../models/SessionHistory');
    
    const [roomsCreated, roomsJoined, sessionsSaved] = await Promise.all([
      Room.countDocuments({ owner: req.user._id }),
      Room.countDocuments({ members: req.user._id }),
      SessionHistory.countDocuments({ savedBy: req.user._id })
    ]);

    res.json({
      roomsCreated,
      roomsJoined,
      sessionsSaved,
      accountCreated: req.user.createdAt,
    });
  } catch (error) {
    console.error('GetMyStats error:', error.message);
    res.status(500).json({ message: 'Server error fetching stats' });
  }
};

// @desc    Request password reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const crypto = require('crypto');
    const sendEmail = require('../utils/sendEmail');
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Please provide an email address' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User with this email address does not exist' });
    }

    // Generate unhashed random reset token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and store in user document with 10-minute expiration
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save({ validateBeforeSave: false });

    // Create reset URL targeting frontend reset-password route
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0b0e14; color: #e1e2eb; border-radius: 10px;">
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #1e2533;">
          <h1 style="color: #3b82f6; margin: 0;">SYNCSCRIPT</h1>
          <p style="color: #8c92a4; font-size: 14px;">Password Reset Request</p>
        </div>
        <div style="padding: 20px 0;">
          <p>Hello ${user.username},</p>
          <p>You requested a password reset for your SYNCSCRIPT account. Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p style="font-size: 13px; color: #8c92a4;">This link will expire in 10 minutes. If you did not request a password reset, please ignore this email.</p>
          <p style="font-size: 12px; color: #586174; overflow-wrap: break-word;">Or copy and paste this URL into your browser:<br/><a href="${resetUrl}" style="color: #3b82f6;">${resetUrl}</a></p>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: 'SYNCSCRIPT Password Reset Request',
        html: htmlContent,
      });

      res.json({ message: 'Password reset link sent to your email address.' });
    } catch (err) {
      console.error('Email delivery error:', err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ message: 'Email could not be sent. Check SMTP configuration.' });
    }
  } catch (error) {
    console.error('ForgotPassword error:', error.message);
    res.status(500).json({ message: 'Server error processing password reset' });
  }
};

// @desc    Reset password using token
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const crypto = require('crypto');
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    // Hash token to compare with DB
    const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ message: 'Password updated successfully. You can now login.' });
  } catch (error) {
    console.error('ResetPassword error:', error.message);
    res.status(500).json({ message: 'Server error resetting password' });
  }
};

module.exports = { register, login, getMe, updateMe, getMyStats, forgotPassword, resetPassword, generateToken };

