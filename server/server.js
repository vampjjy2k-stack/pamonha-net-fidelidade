// server.js
// Ponto de entrada da API — Pamonha Net Fidelidade v2.0
// Responsabilidade: conexão MongoDB, middlewares globais, rotas e fallback SPA.

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');
const { ensureConfigured } = require('./utils/webPush');
const jwt = require('jsonwebtoken');
const liveEvents = require('./utils/events');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// Necessário no Render/Heroku/etc para req.protocol refletir https corretamente atrás do proxy
// (usado para montar os links de QR Code e de redefinição de senha).
app.set('trust proxy', 1);

// --- Validação de variáveis obrigatórias ---
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

// Avisa no boot se as notificações push reais não estiverem configuradas (não impede o servidor de subir).
ensureConfigured();

// --- Servir o frontend estático (client/) ANTES do fallback ---
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir));

// --- Rotas da API ---
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Chave pública VAPID — não é secreta, o app do cliente precisa dela para se inscrever no push.
app.get('/api/push/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Notificações push não configuradas no servidor.' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// GET /api/events — canal ao vivo (Server-Sent Events). O app do cliente mantém isso aberto
// enquanto está na tela; assim que um carimbo é adicionado, uma notificação é enviada, etc.,
// o servidor escreve um evento aqui e a tela se atualiza sozinha, sem esperar o próximo "poll".
// Vai o token como query string (?token=) porque o navegador não permite header customizado em EventSource.
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
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // evita que proxies (Render/nginx) segurem o buffer
  });
  res.write('retry: 3000\n\n');

  liveEvents.addClient(payload.id, res);
  if (payload.role === 'admin') liveEvents.addClient('admins', res);

  // Ping periódico só para manter a conexão viva atrás de proxies que fecham conexões ociosas.
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    liveEvents.removeClient(payload.id, res);
    if (payload.role === 'admin') liveEvents.removeClient('admins', res);
  });
});

// 404 para rotas /api/* não encontradas
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota da API não encontrada.' });
});

// Fallback SPA: qualquer rota não-API cai no index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// Handler de erro genérico
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// --- Conexão MongoDB + inicialização ---
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado ao MongoDB.');
    app.listen(PORT, () => {
      console.log(`🌽 Pamonha Net Fidelidade rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar no MongoDB:', err.message);
    process.exit(1);
  });
