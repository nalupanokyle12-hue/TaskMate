import jwt from 'jsonwebtoken';
const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32 || secret.toLowerCase().includes('replace-with')) {
  throw new Error('Set SESSION_SECRET in server/.env to a unique random value of at least 32 characters.');
}
export const auth = (req, res, next) => {
  try {
    const token = req.cookies?.taskmate_session;
    if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
    req.user = jwt.verify(token, secret);
    next();
  } catch { return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
};
export const setSession = (res, userId) => res.cookie('taskmate_session', jwt.sign({ id: userId }, secret, { expiresIn: '7d' }), {
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000
});
