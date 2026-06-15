const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: Number,
      required: true,
    },
    lang: {
      type: String,
      enum: ['ua', 'en', 'ru'],
      required: true,
    },
    service: {
      type: String,
      enum: ['website', 'landing', 'bot'],
      required: true,
    },
    hasDesign: {
      type: Boolean,
      default: false,
    },
    business: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    contact: {
      type: String,
      required: true,
    },

    note: {
      type: String,
      default: '',
    },

    status: {
      type: String,
      enum: ['new', 'confirmed', 'cancelled', 'done'],
      default: 'new',
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    adminNotes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Order', orderSchema);
