import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors/AppError.js';

export function authenticate(jwtSecret) {
  return (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') ?? '');
    if (!match) return next(new UnauthorizedError());
    try {
      const payload = jwt.verify(match[1], jwtSecret, { algorithms: ['HS256'] });
      if (typeof payload !== 'object' || typeof payload.sub !== 'string'
        || !/^[1-9]\d*$/.test(payload.sub) || !Number.isSafeInteger(Number(payload.sub))
        || !['USER', 'ADMIN'].includes(payload.role)
        || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) {
        return next(new UnauthorizedError('Invalid token'));
      }
      req.user = { id: Number(payload.sub), role: payload.role };
      return next();
    } catch (error) {
      return next(new UnauthorizedError(error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'));
    }
  };
}
