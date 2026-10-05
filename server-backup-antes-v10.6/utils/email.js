// utils/email.js — v10.5.4
// Envia e-mail via API HTTP do Brevo (o Render Free bloqueia SMTP de saída).
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function ensureConfigured() {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.warn('⚠️ BREVO_API_KEY não configurada — envio de e-mail desativado.');
    return false;
  }
  return true;
}

async function sendViaBrevo({ to, toName, subject, html, text }) {
  const key = process.env.BREVO_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'pamonhanet@gmail.com';
  const fromName = process.env.EMAIL_FROM_NAME || 'Pamonha Net';
  const resp = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: { name: fromName, email: fromEmail }, to: [{ email: to, name: toName || to }], subject, htmlContent: html, textContent: text }),
  });
  if (!resp.ok) throw new Error('Brevo ' + resp.status + ': ' + await resp.text());
  return resp.json();
}

async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  if (!ensureConfigured()) {
    console.log('[email desativado] Reset para ' + to + ': ' + resetUrl);
    return false;
  }
  const html = '<div style="font-family:sans-serif;max-width:480px;margin:0 auto">' +
    '<h2 style="color:#3E5A2C">Redefinir sua senha</h2>' +
    '<p>Oi, ' + fullName + '!</p>' +
    '<p>Recebemos um pedido para redefinir a senha do seu cartão fidelidade <strong>Pamonha Net</strong>.</p>' +
    '<p><a href="' + resetUrl + '" style="display:inline-block;background:#F9A825;color:#1B5E20;font-weight:bold;padding:12px 20px;border-radius:8px;text-decoration:none">Escolher nova senha</a></p>' +
    '<p style="color:#607D8B;font-size:13px">Válido por 30 minutos. Se você não pediu isso, ignore este e-mail.</p></div>';
  const text = 'Oi, ' + fullName + '!\n\nRecebemos um pedido para redefinir a senha do seu cartão fidelidade Pamonha Net.\n\nToque no link abaixo para escolher uma nova senha (válido por 30 minutos):\n' + resetUrl + '\n\nSe você não pediu isso, ignore este e-mail.';
  await sendViaBrevo({ to, toName: fullName, subject: 'Redefinir sua senha — Pamonha Net', html, text });
  return true;
}

async function sendTestEmail({ to }) {
  if (!ensureConfigured()) throw new Error('BREVO_API_KEY não configurada.');
  return sendViaBrevo({ to, subject: 'Teste de e-mail — Pamonha Net', html: '<p>Este é um teste. Se você recebeu este e-mail, a recuperação de senha está funcionando. 🌽</p>', text: 'Este é um teste. Se você recebeu este e-mail, a recuperação de senha está funcionando.' });
}
module.exports = { sendPasswordResetEmail, sendTestEmail, ensureConfigured };
