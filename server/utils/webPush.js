// utils/webPush.js
// Encapsula o envio de notificações push reais (Web Push API) para o celular do cliente.
// Usa a biblioteca "web-push", que implementa o protocolo padrão (RFC 8030/8291),
// suportado nativamente pelo Chrome/Edge/Firefox no Android e pelo Safari no iOS
// (a partir do iOS 16.4, exigindo que o site tenha sido adicionado à tela de início).

const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('⚠️  VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas — notificações push desativadas.');
    return false;
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:contato@pamonhanet.com.br',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

/**
 * Envia uma notificação push para um usuário (todas as suas inscrições) ou para todos os clientes.
 * @param {Object} opts
 * @param {string|null} opts.userId - null = envia para todas as inscrições (broadcast)
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.url] - rota que abre ao tocar na notificação (ex: "#notifications")
 * @returns {Promise<{sent:number, failed:number}>}
 */
async function sendPushToUser({ userId, title, body, url = '#notifications' }) {
  if (!ensureConfigured()) return { sent: 0, failed: 0 };

  const query = userId ? { userId } : {};
  const subscriptions = await PushSubscription.find(query);
  if (!subscriptions.length) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({ title, body, url });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          payload
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        // 404/410 = inscrição expirada ou o cliente desativou — limpamos do banco.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        } else {
          console.error('Erro ao enviar push:', err.message);
        }
      }
    })
  );

  return { sent, failed };
}

module.exports = { sendPushToUser, ensureConfigured };
