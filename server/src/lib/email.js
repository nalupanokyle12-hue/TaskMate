import nodemailer from 'nodemailer';
import { randomBytes, randomInt, createHash, createHmac } from 'node:crypto';

export function createEmailCode() { return randomInt(0, 1_000_000).toString().padStart(6, '0'); }
export function createChallengeId() { return randomBytes(32).toString('base64url'); }
export function hashChallengeId(challengeId) { return createHash('sha256').update(challengeId).digest('hex'); }
export function hashEmailCode(challengeId, code) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET.toLowerCase().includes('replace-with')) throw new Error('Set SESSION_SECRET to a unique random value of at least 32 characters.');
  return createHmac('sha256', process.env.SESSION_SECRET).update(`${challengeId}:${code}`).digest('hex');
}

export async function sendEmailCode({ email, fullName, code, purpose }) {
  const subject = purpose === 'registration' ? 'Your TaskMate verification code' : 'Your TaskMate sign-in code';
  const action = purpose === 'registration' ? 'verify your email address' : 'finish signing in';
  const text = `Hi ${fullName},\n\nUse this code to ${action}: ${code}\n\nIt expires in 10 minutes. If you did not request this code, you can ignore this email.`;
  const html = `<p>Hi ${escapeHtml(fullName)},</p><p>Use this code to ${action}:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`;
  if (process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { name: process.env.BREVO_SENDER_NAME || 'TaskMate', email: process.env.BREVO_SENDER_EMAIL }, to: [{ email }], subject, textContent: text, htmlContent: html }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Brevo email API returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return 'sent';
  }
  const hasSmtp = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM;
  if (!hasSmtp) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email delivery is not configured.');
    console.info(`[TaskMate development ${purpose} code] ${email}: ${code}`);
    return 'development';
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === 'true' || port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
  await transport.sendMail({ from: process.env.SMTP_FROM, to: email, subject, text, html });
  return 'sent';
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

