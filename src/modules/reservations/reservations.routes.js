import { Router } from 'express';

export function createReservationsRouter(controller) {
  const router = Router();
  router.post('/', controller.create);
  router.get('/', controller.list);
  router.patch('/:id/cancel', controller.cancel);
  return router;
}
