// utils/events.js
// Hub de eventos em tempo real via Server-Sent Events (SSE) — uma conexão HTTP que fica aberta
// e o servidor vai escrevendo nela quando algo relevante acontece (carimbo, notificação, etc).
// Não precisa de biblioteca nova nem de infraestrutura extra (Redis, WebSocket server...):
// roda em cima do Express normal. Única limitação honesta: como a lista de conexões vive só na
// memória deste processo, só funciona com uma instância do servidor rodando (é o caso do plano
// gratuito do Render — se um dia escalar para múltiplas instâncias, isso precisa de um adaptador
// como Redis pub/sub).

const clients = new Map(); // userId (string) -> Set<res>

function addClient(userId, res) {
  const key = String(userId);
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(res);
}

function removeClient(userId, res) {
  const key = String(userId);
  const set = clients.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(key);
}

function writeEvent(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    // conexão pode já ter caído — ignora, a limpeza acontece no 'close' do response
  }
}

/** Envia um evento só para um usuário específico (todas as abas/dispositivos dele). */
function sendToUser(userId, event, data) {
  const set = clients.get(String(userId));
  if (!set) return;
  set.forEach((res) => writeEvent(res, event, data));
}

/** Envia um evento para todo mundo conectado agora (clientes e admins). */
function broadcast(event, data) {
  clients.forEach((set) => set.forEach((res) => writeEvent(res, event, data)));
}

module.exports = { addClient, removeClient, sendToUser, broadcast };
