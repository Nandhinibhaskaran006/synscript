const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderId: {
      type: String,
    },
    senderUsername: {
      type: String,
      required: true,
    },
    senderName: {
      type: String,
    },
    senderAvatar: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      required: [true, 'Message cannot be empty'],
      trim: true,
    },
  },
  { timestamps: true }
);

chatMessageSchema.index({ roomId: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
