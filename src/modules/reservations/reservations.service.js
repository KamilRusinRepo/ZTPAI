import { AppError } from '../../errors/AppError.js';

export function createReservationsService({ roomsRepository, reservationsRepository, now = () => new Date() }) {
  return {
    async createReservation(input) {
      const room = await roomsRepository.findById(input.roomId);
      if (!room) throw new AppError('Room not found', 404);
      if (input.participants > room.capacity) throw new AppError('Room capacity exceeded', 409);
      return reservationsRepository.create({
        roomId: input.roomId,
        reservedBy: input.reservedBy,
        participants: input.participants,
        startTime: input.startTime,
        endTime: input.endTime,
        status: 'CONFIRMED',
        createdAt: now().toISOString(),
        cancelledAt: null,
      });
    },
    async listReservations(filters) {
      return reservationsRepository.list(filters);
    },
    async cancelReservation(id) {
      const reservation = await reservationsRepository.findById(id);
      if (!reservation) throw new AppError('Reservation not found', 404);
      if (reservation.status === 'CANCELLED') return reservation;
      return reservationsRepository.updateStatus(id, 'CANCELLED', now().toISOString());
    },
  };
}
