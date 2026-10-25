import { ConflictError, NotFoundError, ValidationError } from '../../errors/AppError.js';

const MIN_DURATION_MS = 15 * 60 * 1000;
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;

export function createReservationsService({ roomsRepository, reservationsRepository, now = () => new Date() }) {
  async function createCheckedReservation(input) {
    const room = await roomsRepository.findById(input.roomId);
    if (!room) throw new NotFoundError('Room');
    if (input.participants > room.capacity) throw new ConflictError('Room capacity exceeded', 'ROOM_CAPACITY_EXCEEDED');

    const currentTime = now();
    const start = new Date(input.startTime).getTime();
    const end = new Date(input.endTime).getTime();
    const details = [];
    if (end <= start) {
      details.push({ location: 'body', field: 'endTime', message: 'endTime must be later than startTime' });
    } else if (end - start < MIN_DURATION_MS || end - start > MAX_DURATION_MS) {
      details.push({ location: 'body', field: 'endTime', message: 'Reservation must last between 15 minutes and 8 hours' });
    }
    if (start < currentTime.getTime()) {
      details.push({ location: 'body', field: 'startTime', message: 'startTime must not be in the past' });
    }
    if (details.length) throw new ValidationError(details);

    const reservations = await reservationsRepository.list({ roomId: input.roomId });
    const overlaps = reservations.some((reservation) =>
      reservation.status === 'CONFIRMED'
      && start < new Date(reservation.endTime).getTime()
      && new Date(reservation.startTime).getTime() < end
    );
    if (overlaps) throw new ConflictError('Room is already booked for this time', 'ROOM_ALREADY_BOOKED');

    return reservationsRepository.create({
      roomId: input.roomId,
      reservedBy: input.reservedBy,
      participants: input.participants,
      startTime: input.startTime,
      endTime: input.endTime,
      status: 'CONFIRMED',
      createdAt: currentTime.toISOString(),
      cancelledAt: null,
    });
  }

  // Sprawdzenie dostępności i zapis wykonujemy kolejno, także dla równoczesnych żądań.
  let creationQueue = Promise.resolve();
  return {
    async createReservation(input) {
      const operation = creationQueue.then(() => createCheckedReservation(input));
      // Odrzucone żądanie nie blokuje kolejnych; jego błąd nadal trafia do wywołującego.
      creationQueue = operation.catch(() => {});
      return operation;
    },
    async listReservations(filters) {
      return reservationsRepository.list(filters);
    },
    async cancelReservation(id) {
      const reservation = await reservationsRepository.findById(id);
      if (!reservation) throw new NotFoundError('Reservation');
      if (reservation.status === 'CANCELLED') return reservation;
      return reservationsRepository.updateStatus(id, 'CANCELLED', now().toISOString());
    },
  };
}
