import { Router } from 'express';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { auditLogQuery } from './audit-log.schemas.js';

export function createAuditLogRouter(controller) {
  const router = Router();
  router.get('/audit-log', authorize('ADMIN'), validate({ query: auditLogQuery }), controller.list);
  return router;
}
