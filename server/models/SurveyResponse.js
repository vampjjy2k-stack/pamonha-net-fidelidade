// models/SurveyResponse.js
// Respostas da pesquisa de satisfação de 3 perguntas (perguntas fixas, definidas no frontend).
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
    experience: { type: Number, min: 1, max: 5, required: true },
    service: { type: Number, min: 1, max: 5, required: true },
    recommend: { type: Number, min: 1, max: 5, required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

surveyResponseSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SurveyResponse', surveyResponseSchema);
