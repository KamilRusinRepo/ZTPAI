import { toReservationResponse } from './reservations.mapper.js';

export function createReservationsController(reservationsService) {
  return {
    async create(req, res) {
      const reservation = await reservationsService.createReservation(req.validated.body);
      return res.status(201).json(toReservationResponse(reservation));
    },
    async list(req, res) {
      const reservations = await reservationsService.listReservations(req.validated.query);
      return res.json(reservations.map(toReservationResponse));
    },
    async cancel(req, res) {
      const reservation = await reservationsService.cancelReservation(req.validated.params.id);
      return res.json(toReservationResponse(reservation));
    },
  };
}
