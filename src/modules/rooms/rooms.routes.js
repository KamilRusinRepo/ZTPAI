import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams, createRoomBody } from './rooms.schemas.js';

export function createRoomsRouter(controller) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', validate({ body: createRoomBody }), controller.create);
  router.get('/:id', validate({ params: idParams }), controller.getById);
  return router;
}
