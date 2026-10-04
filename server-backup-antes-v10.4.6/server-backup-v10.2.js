
// server.js — Pamonha Net Fidelidade v10
// Novidade na v10: rotas do "Carro da Pamonha" montadas em /api/carro.

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');
const carroRoutes = require('./routes/carro');   // NOVO na v10
const { ensureConfigured } = require('./utils/webPush');
const liveEvents = require('./utils/events');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// Necessário no Render para req.protocol refletir https atrás do proxy.
app.set('trust proxy', 1);

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI não definida. Configure o .env antes de iniciar.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET não definida. Configure o .env antes de iniciar.');
  process.exit(1);
}

// --- Middlewares globais ---
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
// 8mb porque imagens de produto chegam em base64 dentro do JSON.
app.use(express.json({ limit: '8mb' }));

// Avisa no log se push não estiver configurado — não impede o servidor de subir.
ensureConfigured();

// --- Frontend estático ---
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir));

// --- Rotas da API ---
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/carro', carroRoutes());   // NOVO na v10

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: 'v10', timestamp: new Date().toISOString() });
});

// Chave pública VAPID (usada pelo app do cliente pra se inscrever no push).
app.get('/api/push/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Notificações push não configuradas no servidor.' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Canal ao vivo (SSE) — o app mantém aberto enquanto está na tela.
app.get('/api/events', (req, res) => {
  let payload;
  try {
    payload = jwt.verify(req.query.token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).end();
  }

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

// 404 para rotas /api/*
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota da API não encontrada.' });
});

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// Handler de erro genérico
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// --- Conexão MongoDB + start ---
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado ao MongoDB.');
    app.listen(PORT, () => {
      console.log(`🌽 Pamonha Net Fidelidade v10 rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar no MongoDB:', err.message);
    process.exit(1);
  });
