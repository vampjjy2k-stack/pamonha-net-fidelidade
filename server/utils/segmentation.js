// utils/segmentation.js
// Segmentação algorítmica do cliente (Premium / Regular / Risco de Churn),
// baseada em recência, frequência e valor gasto (RFM simplificado).
// Documentado em detalhe em arquitetura-painel-admin.md, seção 3.
const mongoose = require('mongoose');
const StampHistory = require('../models/Stamp');

const MS_POR_DIA = 1000 * 60 * 60 * 24;

/**
 * Calcula o segmento de um cliente em tempo real, a partir do histórico de carimbos.
 * Uso: chamado ao abrir o perfil individual de um cliente (barato, é 1 usuário só).
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {Date|null} lastVisitAt
 * @returns {Promise<{segment: string, score: number, stats: object}>}
 */
async function calcularSegmento(userId, lastVisitAt) {
  const agora = new Date();
  const ha30dias = new Date(agora.getTime() - 30 * MS_POR_DIA);
  const ha90dias = new Date(agora.getTime() - 90 * MS_POR_DIA);
  const idAsObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  const [visitas30d, gastos90dAgg] = await Promise.all([
    StampHistory.countDocuments({ userId, action: 'add', createdAt: { $gte: ha30dias } }),
    StampHistory.aggregate([
      { $match: { userId: idAsObjectId, action: 'add', createdAt: { $gte: ha90dias } } },
      { $group: { _id: null, total: { $sum: '$amountCents' } } },
    ]),
  ]);

  const gastos90dCents = gastos90dAgg[0]?.total || 0;

  if (!lastVisitAt) {
    return { segment: 'novo', score: 0, stats: { visitas30d, gastos90dCents, diasSemVisita: null } };
  }

  const diasSemVisita = Math.floor((agora - new Date(lastVisitAt)) / MS_POR_DIA);
  const recenciaScore = diasSemVisita;
  const frequenciaScore = visitas30d;
  const monetarioScore = gastos90dCents / 100; // em reais

  const score = frequenciaScore * 2 + monetarioScore / 50 - recenciaScore * 1.5;

  let segment;
  if (score >= 40) segment = 'premium';
  else if (score <= 5) segment = 'churn_risk';
  else segment = 'regular';

  return { segment, score: Math.round(score), stats: { visitas30d, gastos90dCents, diasSemVisita } };
}

module.exports = { calcularSegmento };
