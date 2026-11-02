import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams, createBuildingBody } from './buildings.schemas.js';

export function createBuildingsRouter(controller) {
  const router = Router();
  router.get('/', controller.list);
  router.get('/:id', validate({ params: idParams }), controller.getById);
  router.post('/', validate({ body: createBuildingBody }), controller.create);
  return router;
}
