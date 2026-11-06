import { toReservationResponse, toReservationDetailsResponse } from './reservations.mapper.js';

export function createReservationsController(reservationsService) {
  return {
    async getById(req, res) {
      const reservation = await reservationsService.getReservation(req.validated.params.id);
      return res.json(toReservationDetailsResponse(reservation));
    },
    async create(req, res) {
      const reservation = await reservationsService.createReservation(req.validated.body, req.user);
      return res.status(201).location(`/api/reservations/${reservation.id}`).json(toReservationResponse(reservation));
    },
    async list(req, res) {
      const { page, limit } = req.validated.query;
      const { items, total } = await reservationsService.listReservations(req.validated.query);
      return res.json({
        data: items.map(toReservationDetailsResponse),
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    },
    async cancel(req, res) {
      const reservation = await reservationsService.cancelReservation(req.validated.params.id);
      return res.json(toReservationResponse(reservation));
    },
  };
}
