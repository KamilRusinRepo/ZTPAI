import { AppError } from '../errors/AppError.js';

export function notFound(req, res, next) {
  next(new AppError('Endpoint not found', 404));
}
