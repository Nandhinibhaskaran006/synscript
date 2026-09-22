const mongoose = require('mongoose');

const sessionHistorySchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    savedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      default: 'javascript',
    },
    label: {
      type: String,
      default: '',
    },
    files: {
      type: Array,
      default: [],
    },
  },
  { timestamps: true }
);

sessionHistorySchema.index({ roomId: 1, createdAt: -1 });
sessionHistorySchema.index({ savedBy: 1 });

module.exports = mongoose.model('SessionHistory', sessionHistorySchema);
