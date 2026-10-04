
// routes/carro.js — Carro da Pamonha (localização móvel em tempo real).
// Já vem montado no server.js na v10.

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createCarroService, nomeDoEndereco, CarroError } = require('../carro-core');

const User = require('../models/User');
const Local = require('../models/Local');

// ---- Persistência: um único documento "main" ------------------------------------------------
const CarroState = mongoose.models.CarroState || mongoose.model('CarroState', new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  live: { type: Boolean, default: false },
  startedAt: Date,
  startedBy: String,
  position: { lat: Number, lng: Number, accuracy: Number, speed: Number, heading: Number, at: Date },
  placeName: String,
  placeSource: String,
  localId: String,
  manualPlaceName: String,
  aviso: { message: String, place: String, showAt: Date, hideAt: Date },
  updatedAt: Date,
}, { minimize: false }));

const store = {
  async load() { return CarroState.findOne({ key: 'main' }).lean(); },
  async save(doc) {
    const { _id, __v, ...rest } = doc;
    await CarroState.updateOne({ key: 'main' }, { $set: { ...rest, key: 'main' } }, { upsert: true });
    return doc;
  },
};

// ---- Nome do lugar: Locais cadastrados primeiro, OpenStreetMap como reserva -----------------
async function geocode(lat, lng) {
  if (typeof fetch !== 'function') return null; // Node < 18
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'PamonhaNetFidelidade/1.0 (cartao fidelidade; contato via site)' },
    });
    if (!res.ok) return null;
    return nomeDoEndereco(await res.json());
  } catch (_) { return null; } finally { clearTimeout(timer); }
}

async function listLocais() {
  return Local.find({ active: true }).select('name lat lng radiusMeters').lean();
}

// ---- SSE: todos os clientes conectados recebem a posição na hora -----------------------------
const sseClients = new Set();
function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); if (typeof res.flush === 'function') res.flush(); } catch (_) { sseClients.delete(res); }
  }
}

// ---- Autenticação padrão (JWT) -------------------------------------------------------------
function defaultAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = (h.startsWith('Bearer ') ? h.slice(7) : null) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    const id = p.id || p.userId || p._id || p.sub;
    if (!id) throw new Error('sem id');
    req.user = { _id: String(id), role: p.role };
    next();
  } catch (_) { res.status(401).json({ error: 'Sessão expirada. Entre de novo.' }); }
}
async function defaultAdminOnly(req, res, next) {
  try {
    const u = await User.findById(req.user._id).select('role').lean();
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Apenas o administrador pode fazer isso.' });
    next();
  } catch (_) { res.status(403).json({ error: 'Apenas o administrador pode fazer isso.' }); }
}

module.exports = function carroRouter(opts = {}) {
  const auth = opts.auth || defaultAuth;
  const adminOnly = opts.adminOnly || defaultAdminOnly;
  const service = createCarroService({ store, listLocais, geocode, broadcast });
  const router = express.Router();

  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) {
      if (e instanceof CarroError) return res.status(e.status).json({ error: e.message });
      console.error('[carro]', e);
      res.status(500).json({ error: 'Não foi possível concluir. Tente novamente.' });
    }
  };

  // Cliente: estado atual (botão aparece só se live === true)
  router.get('/', auth, wrap(() => service.getPublic()));

  // Cliente: fluxo ao vivo (SSE)
  router.get('/stream', auth, async (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders && res.flushHeaders();
    res.write('retry: 4000\n\n');
    sseClients.add(res);
    try { res.write(`event: carro\ndata: ${JSON.stringify(await service.getPublic())}\n\n`); } catch (_) {}
    const beat = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 25000);
    req.on('close', () => { clearInterval(beat); sseClients.delete(res); });
  });

  // Admin
  router.get('/admin', auth, adminOnly, wrap(() => service.getAdmin()));
  router.post('/iniciar', auth, adminOnly, wrap((req) => service.iniciar(req.body || {}, req.user._id)));
  router.post('/posicao', auth, adminOnly, wrap((req) => service.posicao(req.body || {})));
  router.put('/lugar', auth, adminOnly, wrap((req) => service.setLugarManual(req.body || {})));
  router.post('/parar', auth, adminOnly, wrap(() => service.parar()));
  router.put('/aviso', auth, adminOnly, wrap((req) => service.setAviso(req.body || {})));
  router.delete('/aviso', auth, adminOnly, wrap(() => service.clearAviso()));

  // Sweep: encerra sozinho se passar do horário do aviso ou o celular sumir.
  const sweeper = setInterval(() => { service.sweep().catch(() => {}); }, 30000);
  if (sweeper.unref) sweeper.unref();

  return router;
};
