import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams, createBuildingBody, updateBuildingBody } from './buildings.schemas.js';
import { authorize } from '../../middleware/authorize.js';

export function createBuildingsRouter(controller) {
  const router = Router();
  router.get('/', controller.list);
  router.get('/:id/rooms', validate({ params: idParams }), controller.listRooms);
  router.get('/:id', validate({ params: idParams }), controller.getById);
  router.post('/', authorize('ADMIN'), validate({ body: createBuildingBody }), controller.create);
  router.patch('/:id', authorize('ADMIN'), validate({ params: idParams, body: updateBuildingBody }), controller.update);
  router.delete('/:id', authorize('ADMIN'), validate({ params: idParams }), controller.remove);
  return router;
}
