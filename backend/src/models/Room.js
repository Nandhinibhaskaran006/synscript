const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Room name is required'],
      trim: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    language: {
      type: String,
      default: 'javascript',
    },
    currentCode: {
      type: String,
      default: '',
    },
    files: [
      {
        path: { type: String, required: true },
        name: { type: String, required: true },
        type: { type: String, enum: ['file', 'folder'], default: 'file' },
        content: { type: String, default: '' },
        isOpen: { type: Boolean, default: true },
      },
    ],
    isPrivate: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

roomSchema.index({ owner: 1 });
roomSchema.index({ members: 1 });
roomSchema.index({ createdAt: -1 });
roomSchema.index({ owner: 1, members: 1 });

module.exports = mongoose.model('Room', roomSchema);
