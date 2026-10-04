import jwt from 'jsonwebtoken';
import { Session, User, publicUser } from './models.js';

export const cookieName = 'hms_session';
export function cookieOptions(config) {
  return { httpOnly: true, secure: config.env === 'production', sameSite: 'strict', path: '/' };
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function createSession(user, config, dbSession) {
  const expiresAt = new Date(Date.now() + config.sessionHours * 60 * 60 * 1000);
  const [record] = await Session.create([{ user: user._id, expiresAt }], { session: dbSession });
  const token = jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256',
    subject: String(user._id),
    jwtid: String(record._id),
    issuer: 'smart-hms',
    audience: 'smart-hms-web',
    expiresIn: `${config.sessionHours}h`,
  });
  return { token, expiresAt, user: publicUser(user) };
}

export function sendSession(res, session, config, status = 200) {
  res.cookie(cookieName, session.token, { ...cookieOptions(config), expires: session.expiresAt });
  return res.status(status).json({ user: session.user });
}

export function authenticate(config) {
  return async (req, res, next) => {
    const token = req.cookies[cookieName];
    if (!token) throw httpError(401, 'Please sign in to continue.');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'smart-hms',
        audience: 'smart-hms-web',
      });
      if (!/^[a-f\d]{24}$/i.test(payload.sub) || !/^[a-f\d]{24}$/i.test(payload.jti))
        throw new Error('Invalid session');
    } catch {
      throw httpError(401, 'Your session has expired. Please sign in again.');
    }
    const session = await Session.findOne({
      _id: payload.jti,
      user: payload.sub,
      expiresAt: { $gt: new Date() },
    });
    if (!session) throw httpError(401, 'Your session has expired. Please sign in again.');
    const user = await User.findById(payload.sub);
    if (!user?.isActive)
      throw httpError(401, 'This account is unavailable. Please contact an administrator.');
    req.user = user;
    req.authSession = session;
    next();
  };
}

export function allowRoles(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user.role))
      throw httpError(403, 'You do not have permission to access this resource.');
    next();
  };
}
