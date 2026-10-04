// server.js — Pamonha Net Fidelidade v10.3
// Novidades v10.3: rotas públicas /api/public/* para a landing page.

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');
const carroRoutes = require('./routes/carro');
const { ensureConfigured } = require('./utils/webPush');
const liveEvents = require('./utils/events');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

app.set('trust proxy', 1);

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI não definida.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET não definida.');
  process.exit(1);
}
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const clientUrl = process.env.CLIENT_URL && process.env.CLIENT_URL !== '*' ? process.env.CLIENT_URL : null;
// O frontend é servido pelo próprio servidor; sem CLIENT_URL, não habilitamos CORS.
app.use(clientUrl ? cors({ origin: clientUrl, credentials: true }) : cors({ origin: false }));
app.use(express.json({ limit: '8mb' }));
ensureConfigured();

const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir));

// --- Rotas da API ---
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/carro', carroRoutes());

// --- Rotas públicas (sem login) — usadas pela landing page ---
app.get('/api/public/locais', async (req, res) => {
  try {
    const Local = require('./models/Local');
    const locais = await Local.find({ active: true })
      .select('name lat lng radiusMeters')
      .sort({ name: 1 })
      .lean();
    const withUrl = locais.map((l) => ({
      ...l,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`,
    }));
    res.json({ locais: withUrl });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar os locais.' });
  }
});

app.get('/api/public/info', async (req, res) => {
  try {
    const User = require('./models/User');
    const Feedback = require('./models/Feedback');
    const [clients, agg, premiosAtivos] = await Promise.all([
      User.countDocuments({ role: 'client' }),
      Feedback.aggregate([{ $group: { _id: null, avg: { $avg: '$average' } } }]),
      mongoose.models.Premio ? mongoose.model('Premio').countDocuments({ active: true }) : Promise.resolve(0),
    ]);
    res.json({
      totalClients: clients,
      avgRating: agg[0] ? Math.round(agg[0].avg * 10) / 10 : null,
      totalPremios: premiosAtivos,
    });
  } catch (err) {
    res.json({ totalClients: 0, avgRating: null, totalPremios: 0 });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: 'v10.3', timestamp: new Date().toISOString() });
});

app.get('/api/push/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Notificações push não configuradas.' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.get('/api/events', (req, res) => {
  let payload;
  try { payload = jwt.verify(req.query.token, process.env.JWT_SECRET); }
  catch (err) { return res.status(401).end(); }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  liveEvents.addClient(payload.id, res);
  if (payload.role === 'admin') liveEvents.addClient('admins', res);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(keepAlive);
    liveEvents.removeClient(payload.id, res);
    if (payload.role === 'admin') liveEvents.removeClient('admins', res);
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota da API não encontrada.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado ao MongoDB.');
    app.listen(PORT, () => {
      console.log(`🌽 Pamonha Net Fidelidade v10.3 rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar no MongoDB:', err.message);
    process.exit(1);
  });
