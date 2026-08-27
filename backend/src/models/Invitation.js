const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: [true, 'Room ID is required'],
    },
    roomName: {
      type: String,
      required: [true, 'Room name is required'],
    },
    inviterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    inviterName: {
      type: String,
      required: true,
    },
    inviteeEmail: {
      type: String,
      required: [true, 'Invitee email is required'],
      lowercase: true,
      trim: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired'],
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invitation', invitationSchema);
