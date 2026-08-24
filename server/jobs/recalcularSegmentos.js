// jobs/recalcularSegmentos.js
// Job agendado que recalcula a segmentação dos clientes (RFM simplificado).
// Pode ser rodado manualmente: node jobs/recalcularSegmentos.js
// Ou agendado via cron no servidor (ex: Render cron job).

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const StampHistory = require('../models/Stamp');

async function recalcularSegmentos() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ Defina MONGODB_URI no .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Conectado ao MongoDB. Iniciando recálculo de segmentos...');

  const clientes = await User.find({ role: 'client' });
  const agora = new Date();
  const trintaDiasAtras = new Date(agora - 30 * 24 * 60 * 60 * 1000);

  let atualizados = 0;

  for (const cliente of clientes) {
    const recenciaDias = cliente.lastVisitAt
      ? Math.floor((agora - cliente.lastVisitAt) / (1000 * 60 * 60 * 24))
      : 999;

    const visitas30d = await StampHistory.countDocuments({
      userId: cliente._id,
      action: 'add',
      deletedAt: null,
      source: { $ne: 'history-delete' },
      createdAt: { $gte: trintaDiasAtras },
    });

    const monetario = cliente.totalSpent || 0;
    const score = (visitas30d * 2) + (monetario / 50) - (recenciaDias * 1.5);

    let segmento = 'regular';
    if (score >= 40) segmento = 'premium';
    else if (score <= 5) segmento = 'churn_risk';

    if (cliente.segment !== segmento) {
      cliente.segment = segmento;
      await cliente.save();
      atualizados++;
    }
  }

  console.log(`✅ Segmentos recalculados! ${atualizados} clientes atualizados.`);
  await mongoose.disconnect();
  process.exit(0);
}

recalcularSegmentos().catch((err) => {
  console.error('❌ Erro no job:', err);
  process.exit(1);
});
