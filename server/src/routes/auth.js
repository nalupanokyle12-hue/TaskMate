import express from 'express';
import bcrypt from 'bcrypt';
import { timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../db.js';
import { auth, setSession } from '../auth.js';
import { createChallengeId, createEmailCode, hashChallengeId, hashEmailCode, sendEmailCode } from '../lib/email.js';

const router = express.Router();
const themes = ['royal-purple', 'sage-green', 'midnight-dark', 'sky-blue', 'rose-pink', 'sunset-amber'];
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const usernamePattern = /^[a-z0-9_]{3,24}$/;

function publicUser(user) {
  return {
    // In verifyCode(), `id` is the challenge row ID; prefer the joined account ID.
    id: user.user_id ?? user.id,
    fullName: user.full_name,
    username: user.username,
    email: user.email,
    theme: themes.includes(user.theme) ? user.theme : 'royal-purple',
    emailLoginMfa: Boolean(user.email_login_mfa),
    avatarUrl: user.profile_avatar_mime ? '/api/v1/auth/avatar?v=' + Date.now() : null,
  };
}

async function issueCode(user, purpose) {
  await pool.execute('DELETE FROM auth_email_challenges WHERE user_id=? AND purpose=?', [user.id, purpose]);
  const challengeId = createChallengeId();
  const code = createEmailCode();
  await pool.execute('INSERT INTO auth_email_challenges(user_id,purpose,challenge_id_hash,code_hash,expires_at) VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))', [user.id, purpose, hashChallengeId(challengeId), hashEmailCode(challengeId, code)]);
  try {
    const delivery = await sendEmailCode({ email: user.email, fullName: user.full_name, code, purpose });
    return { challengeId, sent: true, local: delivery === 'development' };
  } catch (error) {
    console.error(`TaskMate ${purpose} code could not be sent:`, error.message);
    return { challengeId, sent: false };
  }
}
function safeCodeMatch(storedHash, challengeId, code) {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashEmailCode(challengeId, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
async function verifyCode(challengeId, code, purpose) {
  if (typeof challengeId !== 'string' || challengeId.length < 30 || challengeId.length > 100 || !/^\d{6}$/.test(String(code || ''))) return { error: 'Enter the six-digit code from your email.' };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT c.id,c.user_id,c.code_hash,c.attempts,u.full_name,u.username,u.email,u.theme,u.email_verified,u.email_login_mfa,u.profile_avatar_mime FROM auth_email_challenges c JOIN users u ON u.id=c.user_id WHERE c.challenge_id_hash=? AND c.purpose=? AND c.expires_at>UTC_TIMESTAMP() FOR UPDATE', [hashChallengeId(challengeId), purpose]);
    if (!rows.length || rows[0].attempts >= 5) {
      await connection.execute('DELETE FROM auth_email_challenges WHERE challenge_id_hash=?', [hashChallengeId(challengeId)]);
      await connection.commit();
      return { error: 'That code expired or is no longer valid. Request a new code.' };
    }
    const row = rows[0];
    if (!safeCodeMatch(row.code_hash, challengeId, String(code))) {
      const attempts = row.attempts + 1;
      if (attempts >= 5) await connection.execute('DELETE FROM auth_email_challenges WHERE id=?', [row.id]);
      else await connection.execute('UPDATE auth_email_challenges SET attempts=? WHERE id=?', [attempts, row.id]);
      await connection.commit();
      return { error: attempts >= 5 ? 'Too many incorrect codes. Request a new code.' : `That code is incorrect. ${5 - attempts} attempts remain.` };
    }
    await connection.execute('DELETE FROM auth_email_challenges WHERE id=?', [row.id]);
    if (purpose === 'registration') await connection.execute('UPDATE users SET email_verified=TRUE WHERE id=?', [row.user_id]);
    await connection.commit();
    return { user: publicUser(row) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

router.post('/register', codeLimiter, async (req, res, next) => {
  try {
    const fullName = String(req.body.fullName || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password, confirmPassword } = req.body;
    if (!fullName || fullName.length > 120 || !usernamePattern.test(username) || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 72 || password !== confirmPassword) {
      return res.status(400).json({ error: 'Enter a name, a 3–24 character username (letters, numbers, underscores), valid email, and matching password of at least 8 characters.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute('INSERT INTO users(full_name,username,email,password_hash,email_verified,email_login_mfa) VALUES(?,?,?,?,FALSE,TRUE)', [fullName, username, email, passwordHash]);
    const challenge = await issueCode({ id: result.insertId, full_name: fullName, email }, 'registration');
    res.status(201).json({ requiresEmailCode: true, challengeId: challenge.challengeId, email, local: challenge.local, sent: challenge.sent, message: challenge.local ? 'For local development, the code is printed in the backend terminal.' : challenge.sent ? 'Enter the verification code sent to your email.' : 'Your account was created, but email delivery failed. Check provider settings, then request a new code.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email or username is already in use.' });
    next(error);
  }
});

router.post('/verify-registration-code', codeLimiter, async (req, res, next) => {
  try {
    const result = await verifyCode(req.body.challengeId, req.body.code, 'registration');
    if (result.error) return res.status(400).json({ error: result.error });
    setSession(res, result.user.id);
    res.json({ user: result.user, message: 'Email verified. Your account is ready.' });
  } catch (error) { next(error); }
});

router.post('/resend-registration-code', codeLimiter, async (req, res, next) => {
  try {
    const challengeId = String(req.body.challengeId || '');
    if (challengeId.length < 30 || challengeId.length > 100) return res.status(400).json({ error: 'Request a new verification code by registering again or signing in.' });
    const [rows] = await pool.execute('SELECT u.id,u.full_name,u.email FROM auth_email_challenges c JOIN users u ON u.id=c.user_id WHERE c.challenge_id_hash=? AND c.purpose="registration" AND u.email_verified=FALSE', [hashChallengeId(challengeId)]);
    if (!rows.length) return res.status(400).json({ error: 'This verification request expired. Try signing in or registering again.' });
    const challenge = await issueCode(rows[0], 'registration');
    if (!challenge.sent) return res.json({ challengeId: challenge.challengeId, local: false, sent: false, message: 'The code could not be sent. Check the email provider settings, then request another code.' });
    res.json({ challengeId: challenge.challengeId, local: challenge.local, sent: challenge.sent, message: challenge.local ? 'For local development, the new code is printed in the backend terminal.' : 'A new code was sent. It expires in 10 minutes.' });
  } catch (error) { next(error); }
});

router.post('/login', codeLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.execute('SELECT id,full_name,username,email,password_hash,theme,email_verified,email_login_mfa,profile_avatar_mime FROM users WHERE email=?', [String(email || '').trim().toLowerCase()]);
    if (!rows.length || !await bcrypt.compare(password || '', rows[0].password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const user = rows[0];
    if (!user.email_verified) { const challenge = await issueCode(user, 'registration'); return res.json({ requiresEmailCode: true, purpose: 'registration', challengeId: challenge.challengeId, email: user.email, local: challenge.local, sent: challenge.sent, message: challenge.local ? 'For local development, the code is printed in the backend terminal.' : challenge.sent ? 'Verify your email with the six-digit code we sent.' : 'Email delivery failed. Check provider settings, then request a new code.' }); }
    if (user.email_login_mfa) {
      const challenge = await issueCode(user, 'login');
      return res.json({ requiresEmailCode: true, purpose: 'login', challengeId: challenge.challengeId, email: user.email, local: challenge.local, sent: challenge.sent, message: challenge.local ? 'For local development, the code is printed in the backend terminal.' : challenge.sent ? 'Enter the sign-in code sent to your email.' : 'Email delivery failed. Check provider settings, then request a new code.' });
    }
    setSession(res, user.id);
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

router.post('/verify-login-code', codeLimiter, async (req, res, next) => {
  try {
    const result = await verifyCode(req.body.challengeId, req.body.code, 'login');
    if (result.error) return res.status(400).json({ error: result.error });
    setSession(res, result.user.id);
    res.json({ user: result.user });
  } catch (error) { next(error); }
});

router.post('/resend-login-code', codeLimiter, async (req, res, next) => {
  try {
    const challengeId = String(req.body.challengeId || '');
    if (challengeId.length < 30 || challengeId.length > 100) return res.status(400).json({ error: 'Sign in again to request a new code.' });
    const [rows] = await pool.execute('SELECT u.id,u.full_name,u.email FROM auth_email_challenges c JOIN users u ON u.id=c.user_id WHERE c.challenge_id_hash=? AND c.purpose="login" AND u.email_login_mfa=TRUE', [hashChallengeId(challengeId)]);
    if (!rows.length) return res.status(400).json({ error: 'This sign-in request expired. Sign in again to request a new code.' });
    const challenge = await issueCode(rows[0], 'login');
    if (!challenge.sent) return res.json({ challengeId: challenge.challengeId, local: false, sent: false, message: 'The code could not be sent. Check the email provider settings, then request another code.' });
    res.json({ challengeId: challenge.challengeId, local: challenge.local, sent: challenge.sent, message: challenge.local ? 'For local development, the new code is printed in the backend terminal.' : 'A new sign-in code was sent. It expires in 10 minutes.' });
  } catch (error) { next(error); }
});

router.post('/logout', (_req, res) => res.clearCookie('taskmate_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }).json({ ok: true }));

router.get('/me', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT id,full_name,username,email,theme,email_verified,email_login_mfa,updated_at,profile_avatar_mime FROM users WHERE id=?', [req.user.id]);
    if (!rows.length || !rows[0].email_verified) return res.status(401).json({ error: 'Please sign in again.' });
    const user = rows[0];
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

router.get('/avatar', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT profile_avatar_mime,profile_avatar_data FROM users WHERE id=?', [req.user.id]);
    if (!rows.length || !rows[0].profile_avatar_data) return res.status(404).end();
    res.set('Content-Type', rows[0].profile_avatar_mime).set('Cache-Control', 'private, no-store').send(rows[0].profile_avatar_data);
  } catch (error) { next(error); }
});

router.put('/profile', auth, async (req, res, next) => {
  try {
    const fullName = String(req.body.fullName || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    if (!fullName || fullName.length > 120 || !usernamePattern.test(username)) return res.status(400).json({ error: 'Enter a name and a username with 3–24 letters, numbers, or underscores.' });
    await pool.execute('UPDATE users SET full_name=?,username=? WHERE id=?', [fullName, username, req.user.id]);
    res.json({ fullName, username });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That username is already taken.' });
    next(error);
  }
});

router.put('/avatar', auth, async (req, res, next) => {
  try {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(req.body.imageDataUrl || ''));
    if (!match) return res.status(400).json({ error: 'Upload a PNG, JPEG, or WebP image.' });
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > 512 * 1024) return res.status(400).json({ error: 'Profile images must be 512 KB or smaller.' });
    const mime = match[1] === 'jpeg' ? 'image/jpeg' : `image/${match[1]}`;
    const valid = mime === 'image/png' ? image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/jpeg' ? image[0]===255&&image[1]===216&&image[2]===255 : image.length>12&&image.toString('ascii',0,4)==='RIFF'&&image.toString('ascii',8,12)==='WEBP';
    if (!valid) return res.status(400).json({ error: 'The image file contents do not match its image type.' });
    await pool.execute('UPDATE users SET profile_avatar_mime=?,profile_avatar_data=? WHERE id=?', [mime, image, req.user.id]);
    res.json({ avatarUrl: '/api/v1/auth/avatar?v=' + Date.now() });
  } catch (error) { next(error); }
});
router.delete('/avatar', auth, async (req, res, next) => {
  try { await pool.execute('UPDATE users SET profile_avatar_mime=NULL,profile_avatar_data=NULL WHERE id=?', [req.user.id]); res.json({ ok: true }); }
  catch (error) { next(error); }
});

router.put('/login-verification', auth, async (req, res, next) => {
  try {
    const enabled = req.body.enabled;
    if (typeof enabled !== 'boolean' || typeof req.body.currentPassword !== 'string') return res.status(400).json({ error: 'Choose a valid sign-in verification setting and confirm your current password.' });
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    if (!rows.length || !await bcrypt.compare(req.body.currentPassword, rows[0].password_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
    await pool.execute('UPDATE users SET email_login_mfa=? WHERE id=?', [enabled, req.user.id]);
    if (!enabled) await pool.execute('DELETE FROM auth_email_challenges WHERE user_id=? AND purpose="login"', [req.user.id]);
    res.json({ emailLoginMfa: enabled });
  } catch (error) { next(error); }
});

router.put('/theme', auth, async (req, res, next) => {
  try {
    if (!themes.includes(req.body.theme)) return res.status(400).json({ error: 'Choose one of the available themes.' });
    await pool.execute('UPDATE users SET theme=? WHERE id=?', [req.body.theme, req.user.id]);
    res.json({ theme: req.body.theme });
  } catch (error) { next(error); }
});
router.put('/password', auth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    if (!rows.length || !await bcrypt.compare(currentPassword || '', rows[0].password_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) return res.status(400).json({ error: 'New password must be 8–72 characters.' });
    await pool.execute('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(newPassword, 12), req.user.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

export default router;






