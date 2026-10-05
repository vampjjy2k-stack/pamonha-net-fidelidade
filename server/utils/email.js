// utils/email.js — v10.7
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

const escapeHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const firstName = (full) => (String(full || '').trim().split(/\s+/)[0]) || 'tudo bem';

// Endereço da Feira (rodapé). Pode ser trocado por variável de ambiente.
const FOOTER_ADDRESS = process.env.EMAIL_FOOTER_ADDRESS || 'Estr. Velha do Pilar, 408 · Chácaras Rio-Petrópolis · Duque de Caxias · RJ';

/**
 * Monta o e-mail de redefinição de senha.
 * Layout em tabelas + CSS inline (única forma que funciona em Gmail, Outlook e Apple Mail).
 * Botão com cor de fundo escura e texto branco: o modo escuro do Gmail não "inverte" o texto
 * (o botão laranja com texto verde ficava ilegível).
 */
function buildPasswordResetEmail({ fullName, resetUrl }) {
  const name = escapeHtml(firstName(fullName));
  const url = escapeHtml(resetUrl);
  let logoUrl = '';
  try { logoUrl = new URL(resetUrl).origin + '/email-logo.png'; } catch (_) { /* sem logo */ }
  const font = "Arial,'Helvetica Neue',Helvetica,sans-serif";

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>Escolha sua nova senha — Pamonha Net</title></head>
<body style="margin:0;padding:0;background-color:#F6EFC8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F6EFC8;font-size:1px;line-height:1px;">Toque no botão para escolher uma nova senha. O link vale por 30 minutos.&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F6EFC8" style="background-color:#F6EFC8;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
    <tr><td align="center" bgcolor="#1B5E20" style="background-color:#1B5E20;border-radius:20px 20px 0 0;padding:28px 20px 22px;border-bottom:5px solid #F9A825;">
      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" width="110" height="110" alt="Pamonha Net" style="display:block;width:110px;height:110px;border:0;border-radius:55px;margin:0 auto 12px;">` : ''}
      <div style="font-family:${font};font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#FFE082;font-weight:bold;">Cartão fidelidade</div>
    </td></tr>
    <tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:32px 28px 8px;font-family:${font};color:#263238;">
      <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#1B5E20;font-family:${font};">Oi, ${name}! 🌽</h1>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#263238;">Recebemos um pedido para trocar a senha do seu cartão fidelidade da <strong>Pamonha Net</strong>.</p>
      <p style="margin:0 0 26px;font-size:16px;line-height:1.55;color:#263238;">É só tocar no botão abaixo e escolher uma senha nova:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 10px;"><tr>
        <td align="center" bgcolor="#2E7D32" style="background-color:#2E7D32;border-radius:14px;">
          <a href="${url}" target="_blank" style="display:inline-block;padding:16px 34px;font-family:${font};font-size:17px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:14px;">Escolher nova senha</a>
        </td></tr></table>
      <p style="margin:0 0 24px;text-align:center;font-size:13px;color:#607D8B;">⏱ O link vale por <strong>30 minutos</strong> e só pode ser usado uma vez.</p>
    </td></tr>
    <tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:0 28px 28px;font-family:${font};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FFF8E1" style="background-color:#FFF8E1;border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.5;color:#5D4037;">
        <strong>Não foi você?</strong> Pode ignorar este e-mail: sua senha continua a mesma e ninguém consegue entrar na sua conta.
      </td></tr></table>
      <p style="margin:18px 0 4px;font-size:12px;color:#78909C;">O botão não funciona? Copie e cole este endereço no navegador:</p>
      <p style="margin:0;font-size:12px;line-height:1.4;color:#2E7D32;word-break:break-all;">${url}</p>
    </td></tr>
    <tr><td align="center" bgcolor="#1B5E20" style="background-color:#1B5E20;border-radius:0 0 20px 20px;padding:18px 20px;font-family:${font};font-size:12px;line-height:1.5;color:#C8E6C9;">
      <strong style="color:#FFE082;">Pamonha Net</strong> · A cada compra, um selo mais perto do prêmio<br>${escapeHtml(FOOTER_ADDRESS)}
    </td></tr>
  </table>
  <p style="max-width:480px;margin:14px auto 0;font-family:${font};font-size:11px;line-height:1.5;color:#8D8460;text-align:center;">Você recebeu este e-mail porque alguém pediu a troca de senha no cartão fidelidade da Pamonha Net.</p>
</td></tr></table></body></html>`;

  const text = `Oi, ${firstName(fullName)}!\n\nRecebemos um pedido para trocar a senha do seu cartão fidelidade da Pamonha Net.\n\nToque no link abaixo para escolher uma nova senha (vale por 30 minutos e só pode ser usado uma vez):\n${resetUrl}\n\nNão foi você? Pode ignorar este e-mail: sua senha continua a mesma.\n\nPamonha Net — A cada compra, um selo mais perto do prêmio.\n${FOOTER_ADDRESS}`;

  return { subject: 'Pamonha Net: escolha sua nova senha', html, text };
}

async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  if (!ensureConfigured()) {
    console.log('[email desativado] Reset para ' + to + ': ' + resetUrl);
    return false;
  }
  const { subject, html, text } = buildPasswordResetEmail({ fullName, resetUrl });
  await sendViaBrevo({ to, toName: fullName, subject, html, text });
  return true;
}

async function sendTestEmail({ to }) {
  if (!ensureConfigured()) throw new Error('BREVO_API_KEY não configurada.');
  return sendViaBrevo({ to, subject: 'Teste de e-mail — Pamonha Net', html: '<p>Este é um teste. Se você recebeu este e-mail, a recuperação de senha está funcionando. 🌽</p>', text: 'Este é um teste. Se você recebeu este e-mail, a recuperação de senha está funcionando.' });
}
module.exports = { sendPasswordResetEmail, sendTestEmail, ensureConfigured, buildPasswordResetEmail };
