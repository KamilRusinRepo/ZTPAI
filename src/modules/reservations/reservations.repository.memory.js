export function createReservationsRepository({ seedStartedReservation = false, roomsRepository, usersRepository, seedUserId = 1 } = {}) {
  // Opcjonalne dane do demonstracji anulowania rozpoczętej rezerwacji.
  const reservations = seedStartedReservation ? [{
    id: 1,
    roomId: 1,
    userId: seedUserId,
    participants: 10,
    startTime: '2026-10-25T18:00:00.000Z',
    endTime: '2026-10-25T21:00:00.000Z',
    status: 'CONFIRMED',
    createdAt: '2020-11-01T08:00:00.000Z',
    cancelledAt: null,
    internalNote: 'seed: reservation created before its start time',
  }] : [];
  let nextReservationId = Math.max(0, ...reservations.map((reservation) => reservation.id)) + 1;
  async function withRoom(reservation) {
    if (!reservation) return null;
    const result = structuredClone(reservation);
    if (usersRepository) {
      const user = await usersRepository.findById(reservation.userId);
      result.user = user ? { id: user.id, email: user.email } : null;
    }
    if (roomsRepository) {
      const room = await roomsRepository.findById(reservation.roomId);
      result.room = { id: room.id, name: room.name, building: room.building };
    }
    return result;
  }
  return {
    async listPage({ roomId, buildingId, status, from, to, page = 1, limit = 20, sort = 'startTime' } = {}) {
      const roomBuildings = buildingId === undefined ? null : new Map(
        (await roomsRepository.list()).map((room) => [room.id, room.buildingId])
      );
      const filtered = reservations.filter((item) =>
        (roomId === undefined || item.roomId === roomId)
        && (buildingId === undefined || roomBuildings.get(item.roomId) === buildingId)
        && (status === undefined || item.status === status)
        && (from === undefined || new Date(item.endTime) > new Date(from))
        && (to === undefined || new Date(item.startTime) < new Date(to))
      );
      const descending = sort.startsWith('-');
      const field = descending ? sort.slice(1) : sort;
      if (!['startTime', 'createdAt', 'participants'].includes(field)) throw new Error('Unsupported reservation sort');
      filtered.sort((a, b) => {
        const left = field === 'participants' ? a[field] : new Date(a[field]).getTime();
        const right = field === 'participants' ? b[field] : new Date(b[field]).getTime();
        return (left - right) * (descending ? -1 : 1) || a.id - b.id;
      });
      const offset = (page - 1) * limit;
      return { items: await Promise.all(filtered.slice(offset, offset + limit).map(withRoom)), total: filtered.length };
    },
    // Bez paginacji: reguła kolizji musi sprawdzić wszystkie rezerwacje sali.
    async list({ roomId } = {}) {
      return Promise.all(reservations.filter((item) => roomId === undefined || item.roomId === roomId).map(withRoom));
    },
    async findById(id) {
      return withRoom(reservations.find((item) => item.id === id));
    },
    async create(data) {
      const reservation = { ...structuredClone(data), id: nextReservationId++ };
      reservations.push(reservation);
      return withRoom(reservation);
    },
    async updateStatus(id, status, cancelledAt) {
      const reservation = reservations.find((item) => item.id === id);
      if (!reservation) return null;
      reservation.status = status;
      reservation.cancelledAt = cancelledAt;
      return withRoom(reservation);
    },
  };
}
