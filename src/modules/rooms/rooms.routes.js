import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams, createRoomBody, updateRoomBody } from './rooms.schemas.js';
import { authorize } from '../../middleware/authorize.js';

export function createRoomsRouter(controller) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', authorize('ADMIN'), validate({ body: createRoomBody }), controller.create);
  router.patch('/:id', authorize('ADMIN'), validate({ params: idParams, body: updateRoomBody }), controller.update);
  router.delete('/:id', authorize('ADMIN'), validate({ params: idParams }), controller.remove);
  router.get('/:id', validate({ params: idParams }), controller.getById);
  return router;
}
