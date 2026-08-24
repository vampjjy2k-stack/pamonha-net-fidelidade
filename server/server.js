// server.js
// Ponto de entrada da API do cartão fidelidade da Pamonha Net.
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const User = require('./models/User');
const StampHistory = require('./models/Stamp');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');
const adminProductsRoutes = require('./routes/admin-products');
const adminNotificationsRoutes = require('./routes/admin-notifications');
const adminReservationsRoutes = require('./routes/admin-reservations');
const clientSurveyRoutes = require('./routes/client-survey');
const clientReservationsRoutes = require('./routes/client-reservations');


async function recalcularSegmentosEmSegundoPlano() {
  const clientes = await User.find({ role: 'client' });
  const agora = new Date();
  const trintaDiasAtras = new Date(agora - 30 * 24 * 60 * 60 * 1000);
  for (const cliente of clientes) {
    const recenciaDias = cliente.lastVisitAt
      ? Math.floor((agora - cliente.lastVisitAt) / (1000 * 60 * 60 * 24))
      : 999;
    const visitas30d = await StampHistory.countDocuments({
      userId: cliente._id,
      action: 'add',
      deletedAt: null,
      createdAt: { $gte: trintaDiasAtras },
    });
    const monetario = cliente.totalSpent || 0;
    const score = (visitas30d * 2) + (monetario / 50) - (recenciaDias * 1.5);
    const segmento = score >= 40 ? 'premium' : score <= 5 ? 'churn_risk' : 'regular';
    if (cliente.segment !== segmento) {
      cliente.segment = segmento;
      await cliente.save();
    }
  }
}

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const ENABLE_SEGMENT_CRON = process.env.ENABLE_SEGMENT_CRON !== 'false';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI não definida. Configure o arquivo .env antes de iniciar o servidor.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET não definida. Configure o arquivo .env antes de iniciar o servidor.');
  process.exit(1);
}

// --- Middlewares globais ---
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
app.use(express.json());

// --- Servir o frontend estático (client/) ---
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir));

// --- Rotas da API ---
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/client/survey', clientSurveyRoutes);
app.use('/api/client/reservations', clientReservationsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/products', adminProductsRoutes);
app.use('/api/admin/notifications', adminNotificationsRoutes);
app.use('/api/admin/reservations', adminReservationsRoutes);

// Rota de verificação de saúde da API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Qualquer rota /api/* que não bateu em nenhum router acima → 404 em JSON
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota da API não encontrada.' });
});

// Qualquer outra rota não-API cai no index.html (SPA-like fallback simples)
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// --- Handler de erro genérico (fallback) ---
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// --- Conexão com o MongoDB e inicialização do servidor ---
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado ao MongoDB.');
    if (ENABLE_SEGMENT_CRON) {
      cron.schedule('15 3 * * *', () => {
        recalcularSegmentosEmSegundoPlano().catch((err) => console.error('Erro no recálculo automático:', err));
      });
      console.log('🧭 Recálculo de segmentos agendado para 03:15 diariamente.');
    }
    app.listen(PORT, () => {
      console.log(`🌽 Pamonha Net Fidelidade rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar no MongoDB:', err.message);
    process.exit(1);
  });
