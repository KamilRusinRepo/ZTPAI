import { UnauthorizedError, ForbiddenError } from '../errors/AppError.js';

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    return next();
  };
}
