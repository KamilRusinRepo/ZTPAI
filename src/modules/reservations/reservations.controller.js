import { parseCreateReservation, parseReservationId, parseReservationFilters } from './reservations.schemas.js';
import { toReservationResponse } from './reservations.mapper.js';

export function createReservationsController(reservationsService) {
  return {
    async create(req, res) {
      const reservation = await reservationsService.createReservation(parseCreateReservation(req.body));
      return res.status(201).json(toReservationResponse(reservation));
    },
    async list(req, res) {
      const reservations = await reservationsService.listReservations(parseReservationFilters(req.query));
      return res.json(reservations.map(toReservationResponse));
    },
    async cancel(req, res) {
      const reservation = await reservationsService.cancelReservation(parseReservationId(req.params.id));
      return res.json(toReservationResponse(reservation));
    },
  };
}
