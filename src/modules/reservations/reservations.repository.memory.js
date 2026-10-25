export function createReservationsRepository() {
  const reservations = [];
  let nextReservationId = 1;
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
