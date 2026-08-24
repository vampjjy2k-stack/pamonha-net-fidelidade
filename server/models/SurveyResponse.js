// models/SurveyResponse.js
// Respostas da pesquisa de satisfação (3 perguntas fixas).
const mongoose = require('mongoose');

const surveyResponseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    triggeredBy: {
      type: String,
      enum: ['stamp_earned', 'redemption', 'manual'],
      default: 'manual',
    },
    answers: {
      experience: {
        type: Number,
        min: 1,
        max: 5,
        required: true,
      },
      service: {
        type: Number,
        min: 1,
        max: 5,
        required: true,
      },
      recommend: {
        type: Number,
        min: 1,
        max: 5,
        required: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

surveyResponseSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SurveyResponse', surveyResponseSchema);
