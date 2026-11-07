import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { registerBody, loginBody } from './auth.schemas.js';

export function createAuthRouter(controller, requireAuth) {
  const router = Router();
  router.post('/register', validate({ body: registerBody }), controller.register);
  router.post('/login', validate({ body: loginBody }), controller.login);
  router.get('/me', requireAuth, controller.me);
  return router;
}
