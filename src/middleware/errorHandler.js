import { AppError } from '../errors/AppError.js';

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId: req.id,
      },
    });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON', requestId: req.id },
    });
  }
  if (error.status === 413) {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large', requestId: req.id },
    });
  }
  console.error(`[${req.id}]`, error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Unexpected error', requestId: req.id },
  });
}
