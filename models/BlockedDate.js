const mongoose = require('mongoose');

const BlockedDateSchema = new mongoose.Schema({
  dateStr: {
    type: String,
    required: true,
    unique: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('BlockedDate', BlockedDateSchema);
