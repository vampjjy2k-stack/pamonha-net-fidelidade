// server.js
// Ponto de entrada da API do cartão fidelidade da Pamonha Net.
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

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
app.use('/api/admin', adminRoutes);

// Rota de verificação de saúde da API (útil para o serviço de hospedagem)
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
    app.listen(PORT, () => {
      console.log(`🌽 Pamonha Net Fidelidade rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar no MongoDB:', err.message);
    process.exit(1);
  });
