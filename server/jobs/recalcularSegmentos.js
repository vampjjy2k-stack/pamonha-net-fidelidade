// jobs/recalcularSegmentos.js
// Roda 1x/dia (agendado em server.js via node-cron) e recalcula o campo "segment"
// de todos os clientes, para a listagem do admin poder mostrar o selo sem precisar
// agregar o histórico de cada um a cada requisição.
const User = require('../models/User');
const { calcularSegmento } = require('../utils/segmentation');

async function recalcularTodosOsSegmentos() {
  const clientes = await User.find({ role: 'client' }).select('_id lastVisitAt totalSpentCents');
  let atualizados = 0;

  for (const cliente of clientes) {
    const { segment } = await calcularSegmento(cliente._id, cliente.lastVisitAt, cliente.totalSpentCents);
    if (segment !== cliente.segment) {
      await User.updateOne({ _id: cliente._id }, { segment, segmentUpdatedAt: new Date() });
      atualizados++;
    } else {
      await User.updateOne({ _id: cliente._id }, { segmentUpdatedAt: new Date() });
    }
  }

  console.log(`🔁 Segmentação recalculada: ${clientes.length} clientes verificados, ${atualizados} mudaram de segmento.`);
  return { total: clientes.length, atualizados };
}

module.exports = { recalcularTodosOsSegmentos };
