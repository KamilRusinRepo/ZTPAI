import { Router } from 'express';

export function createRoomsRouter(controller) {
  const router = Router();
  router.get('/', controller.list);
  router.get('/:id', controller.getById);
  return router;
}
