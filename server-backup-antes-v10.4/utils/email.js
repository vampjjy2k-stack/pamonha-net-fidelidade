// utils/email.js
// Envio de e-mails transacionais (recuperação de senha, etc.) via SMTP comum — de graça.
// Funciona com qualquer provedor SMTP: Gmail (com "senha de app"), Outlook, Zoho, ou um
// serviço como Resend/Brevo no plano gratuito. Configure as variáveis EMAIL_* no .env.

const nodemailer = require('nodemailer');

let transporter = null;
let configChecked = false;

function ensureConfigured() {
  if (configChecked) return transporter;
  configChecked = true;
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    console.warn('⚠️  EMAIL_HOST/EMAIL_USER/EMAIL_PASS não configuradas — envio de e-mail desativado.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT) || 587,
    secure: Number(EMAIL_PORT) === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  return transporter;
}

/**
 * @returns {Promise<boolean>} true se o e-mail foi enviado (ou simulado em dev sem config)
 */
async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  const t = ensureConfigured();
  if (!t) {
    // Sem configuração de e-mail: não derruba o fluxo, só avisa no log (útil em desenvolvimento).
    console.log(`[email simulado] Reset de senha para ${to}: ${resetUrl}`);
    return false;
  }

  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  await t.sendMail({
    from: `"Pamonha Net" <${fromAddress}>`,
    to,
    subject: 'Redefinir sua senha — Pamonha Net',
    text:
      `Oi, ${fullName}!\n\n` +
      `Recebemos um pedido para redefinir a senha do seu cartão fidelidade Pamonha Net.\n\n` +
      `Toque no link abaixo para escolher uma nova senha (válido por 30 minutos):\n${resetUrl}\n\n` +
      `Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.`,
    html:
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">` +
      `<h2 style="color:#3E5A2C">Redefinir sua senha</h2>` +
      `<p>Oi, ${fullName}!</p>` +
      `<p>Recebemos um pedido para redefinir a senha do seu cartão fidelidade <strong>Pamonha Net</strong>.</p>` +
      `<p><a href="${resetUrl}" style="display:inline-block;background:#E0A215;color:#3E5A2C;font-weight:bold;` +
      `padding:12px 20px;border-radius:8px;text-decoration:none">Escolher nova senha</a></p>` +
      `<p style="color:#6D6151;font-size:13px">Válido por 30 minutos. Se você não pediu isso, ignore este e-mail.</p>` +
      `</div>`,
  });
  return true;
}

module.exports = { sendPasswordResetEmail, ensureConfigured };
