// models/Notification.js
// Notificações enviadas pelo admin para clientes.
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: [true, 'A mensagem é obrigatória.'],
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    audience: {
      type: String,
      enum: ['all', 'single'],
      required: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    deliveredCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Notification', notificationSchema);
