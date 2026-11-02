function toReservation(row) {
  if (!row) return null;
  return {
    id: row.id, roomId: row.room_id, reservedBy: row.reserved_by,
    participants: row.participants, startTime: row.start_time.toISOString(),
    endTime: row.end_time.toISOString(), status: row.status,
    createdAt: row.created_at.toISOString(), cancelledAt: row.cancelled_at?.toISOString() ?? null,
  };
}

export function createReservationsRepository(db) {
  return {
    async list({ roomId } = {}) {
      const query = db('reservations').orderBy('id');
      if (roomId !== undefined) query.where({ room_id: roomId });
      return (await query).map(toReservation);
    },
    async findById(id) {
      return toReservation(await db('reservations').where({ id }).first());
    },
    async create(data) {
      const [row] = await db('reservations').insert({
        room_id: data.roomId, reserved_by: data.reservedBy, participants: data.participants,
        start_time: data.startTime, end_time: data.endTime, status: data.status,
        created_at: data.createdAt, cancelled_at: data.cancelledAt,
      }).returning('*');
      return toReservation(row);
    },
    async updateStatus(id, status, cancelledAt) {
      const [row] = await db('reservations').where({ id })
        .update({ status, cancelled_at: cancelledAt }).returning('*');
      return toReservation(row);
    },
  };
}
