import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { registerBody } from './auth.schemas.js';

export function createAuthRouter(controller) {
  const router = Router();
  router.post('/register', validate({ body: registerBody }), controller.register);
  return router;
}
