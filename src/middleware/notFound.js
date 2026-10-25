import { NotFoundError } from '../errors/AppError.js';

export function notFound(req, res, next) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
}
