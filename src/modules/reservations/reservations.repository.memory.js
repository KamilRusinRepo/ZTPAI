export function createReservationsRepository({ seedStartedReservation = false } = {}) {
  // Opcjonalne dane do demonstracji anulowania rozpoczętej rezerwacji.
  const reservations = seedStartedReservation ? [{
    id: 1,
    roomId: 1,
    reservedBy: 'Jan Kowalski',
    participants: 10,
    startTime: '2026-10-25T18:00:00.000Z',
    endTime: '2026-10-25T21:00:00.000Z',
    status: 'CONFIRMED',
    createdAt: '2020-11-01T08:00:00.000Z',
    cancelledAt: null,
    internalNote: 'seed: reservation created before its start time',
  }] : [];
  let nextReservationId = Math.max(0, ...reservations.map((reservation) => reservation.id)) + 1;
  return {
    async list({ roomId } = {}) {
      return structuredClone(reservations.filter((item) => roomId === undefined || item.roomId === roomId));
    },
    async findById(id) {
      return structuredClone(reservations.find((item) => item.id === id) ?? null);
    },
    async create(data) {
      const reservation = { ...structuredClone(data), id: nextReservationId++ };
      reservations.push(reservation);
      return structuredClone(reservation);
    },
    async updateStatus(id, status, cancelledAt) {
      const reservation = reservations.find((item) => item.id === id);
      if (!reservation) return null;
      reservation.status = status;
      reservation.cancelledAt = cancelledAt;
      return structuredClone(reservation);
    },
  };
}
