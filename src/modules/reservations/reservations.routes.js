import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { createReservationBody, idParams, listReservationsQuery } from './reservations.schemas.js';

export function createReservationsRouter(controller) {
  const router = Router();
  router.post('/', validate({ body: createReservationBody }), controller.create);
  router.get('/', validate({ query: listReservationsQuery }), controller.list);
  router.patch('/:id/cancel', validate({ params: idParams }), controller.cancel);
  return router;
}
