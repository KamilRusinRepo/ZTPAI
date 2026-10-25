import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams } from './rooms.schemas.js';

export function createRoomsRouter(controller) {
  const router = Router();
  router.get('/', controller.list);
  router.get('/:id', validate({ params: idParams }), controller.getById);
  return router;
}
