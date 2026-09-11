const crypto = require('crypto');
const Invitation = require('../models/Invitation');
const Room = require('../models/Room');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// @desc    Send room invitation via email
// @route   POST /api/invitations/send
// @access  Private
const sendInvitation = async (req, res) => {
  try {
    console.log("INVITATION REQUEST RECEIVED");
    console.log(req.body);
    console.log(req.user);

    const { roomId, inviteeEmail } = req.body;

    if (!roomId || !inviteeEmail) {
      return res.status(400).json({ message: 'Room ID and invitee email are required' });
    }

    const room = await Room.findOne({ roomId }).populate('owner', 'username');
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');

    // Create invitation record
    const invitation = await Invitation.create({
      roomId: room.roomId,
      roomName: room.name,
      inviterId: req.user._id,
      inviterName: req.user.username,
      inviteeEmail,
      token,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const acceptUrl = `${frontendUrl}/invite/${token}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0b0e14; color: #e1e2eb; border-radius: 10px;">
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #1e2533;">
          <h1 style="color: #3b82f6; margin: 0;">SYNCSCRIPT</h1>
          <p style="color: #8c92a4; font-size: 14px;">Project Collaboration Invite</p>
        </div>
        <div style="padding: 20px 0;">
          <p style="font-size: 16px;">Hello,</p>
          <p style="font-size: 15px; line-height: 1.5;">
            <strong>${req.user.username}</strong> has invited you to collaborate on the project room <strong>${room.name}</strong> (Room ID: <code style="background-color: #1e2533; padding: 2px 6px; rounded: 4px; color: #3b82f6;">${room.roomId}</code>).
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${acceptUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 15px;">Accept Invitation</a>
          </div>
          <p style="font-size: 13px; color: #8c92a4;">This invitation link is valid for 7 days. If you do not wish to join, you can ignore this email.</p>
          <p style="font-size: 12px; color: #586174; overflow-wrap: break-word;">Or copy and paste this URL into your browser:<br/><a href="${acceptUrl}" style="color: #3b82f6;">${acceptUrl}</a></p>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        email: inviteeEmail,
        subject: `${req.user.username} invited you to join ${room.name} on SYNCSCRIPT`,
        html: htmlContent,
      });

      res.status(201).json({
        message: 'Invitation sent successfully',
        invitation,
      });
    } catch (emailErr) {
      console.error('Failed to send invitation email:', emailErr);
      res.status(201).json({
        message: 'Invitation created, but failed to deliver email. Check SMTP settings.',
        invitation,
      });
    }
  } catch (error) {
    console.error('SendInvitation error:', error);
    res.status(500).json({ message: 'Server error sending invitation' });
  }
};

// @desc    Get invitation details by token
// @route   GET /api/invitations/:token
// @access  Public
const getInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    const invitation = await Invitation.findOne({ token });

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Check if expired
    if (invitation.status === 'pending' && new Date() > invitation.expiresAt) {
      invitation.status = 'expired';
      await invitation.save();
    }

    res.json(invitation);
  } catch (error) {
    console.error('GetInvitation error:', error);
    res.status(500).json({ message: 'Server error fetching invitation' });
  }
};

// @desc    Accept invitation
// @route   POST /api/invitations/accept
// @access  Private
const acceptInvitation = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Invitation token is required' });
    }

    const invitation = await Invitation.findOne({ token });
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    if (invitation.status === 'accepted') {
      return res.json({ message: 'Invitation already accepted', roomId: invitation.roomId });
    }

    if (invitation.status === 'declined') {
      return res.status(400).json({ message: 'Invitation was previously declined' });
    }

    if (invitation.status === 'expired' || new Date() > invitation.expiresAt) {
      invitation.status = 'expired';
      await invitation.save();
      return res.status(400).json({ message: 'Invitation has expired' });
    }

    const room = await Room.findOne({ roomId: invitation.roomId });
    if (!room) {
      return res.status(404).json({ message: 'Target room no longer exists' });
    }

    // Add user to room members if not already present
    if (!room.members.includes(req.user._id)) {
      room.members.push(req.user._id);
      await room.save();
    }

    // Mark invitation as accepted
    invitation.status = 'accepted';
    await invitation.save();

    res.json({
      message: 'Invitation accepted successfully',
      roomId: room.roomId,
      roomName: room.name,
    });
  } catch (error) {
    console.error('AcceptInvitation error:', error);
    res.status(500).json({ message: 'Server error accepting invitation' });
  }
};

// @desc    Decline invitation
// @route   POST /api/invitations/decline
// @access  Public / Private
const declineInvitation = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Invitation token is required' });
    }

    const invitation = await Invitation.findOne({ token });
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    invitation.status = 'declined';
    await invitation.save();

    res.json({ message: 'Invitation declined' });
  } catch (error) {
    console.error('DeclineInvitation error:', error);
    res.status(500).json({ message: 'Server error declining invitation' });
  }
};

// @desc    Get invitations received by logged-in user
// @route   GET /api/invitations/received
// @access  Private
const getReceivedInvitations = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const invitations = await Invitation.find({ inviteeEmail: userEmail })
      .sort({ createdAt: -1 });

    // Auto-expire any that are past their expiry date
    for (const inv of invitations) {
      if (inv.status === 'pending' && new Date() > inv.expiresAt) {
        inv.status = 'expired';
        await inv.save();
      }
    }

    res.json(invitations);
  } catch (error) {
    console.error('GetReceivedInvitations error:', error);
    res.status(500).json({ message: 'Server error fetching received invitations' });
  }
};

// @desc    Get invitations sent by logged-in user
// @route   GET /api/invitations/sent
// @access  Private
const getSentInvitations = async (req, res) => {
  try {
    const invitations = await Invitation.find({ inviterId: req.user._id })
      .sort({ createdAt: -1 });
    res.json(invitations);
  } catch (error) {
    console.error('GetSentInvitations error:', error);
    res.status(500).json({ message: 'Server error fetching sent invitations' });
  }
};

module.exports = {
  sendInvitation,
  getInvitation,
  acceptInvitation,
  declineInvitation,
  getReceivedInvitations,
  getSentInvitations,
};
