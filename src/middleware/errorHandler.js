import { AppError } from '../errors/AppError.js';

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
  if (error.status === 413) return res.status(413).json({ message: 'Request body too large' });
  console.error(error);
  return res.status(500).json({ message: 'Internal server error' });
}
