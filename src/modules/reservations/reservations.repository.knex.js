function toReservation(row) {
  if (!row) return null;
  return {
    id: row.id, roomId: row.room_id, reservedBy: row.reserved_by,
    participants: row.participants, startTime: row.start_time.toISOString(),
    endTime: row.end_time.toISOString(), status: row.status,
    createdAt: row.created_at.toISOString(), cancelledAt: row.cancelled_at?.toISOString() ?? null,
    ...(row.room_name === undefined ? {} : {
      room: { id: row.room_id, name: row.room_name,
        building: { id: row.building_id, name: row.building_name } },
    }),
  };
}

const SORT_COLUMNS = {
  startTime: 'res.start_time',
  createdAt: 'res.created_at',
  participants: 'res.participants',
};

export function createReservationsRepository(db) {
  // Jeden JOIN pobiera komplet danych niezależnie od liczby rezerwacji.
  function withRelations() {
    return db('reservations as res')
      .join('rooms as r', 'r.id', 'res.room_id')
      .join('buildings as b', 'b.id', 'r.building_id')
      .select('res.*', 'r.name as room_name', 'b.id as building_id', 'b.name as building_name');
  }
  return {
    async listPage({ roomId, buildingId, status, from, to, page = 1, limit = 20, sort = 'startTime' } = {}) {
      const base = withRelations().modify((query) => {
        if (roomId !== undefined) query.where('res.room_id', roomId);
        if (buildingId !== undefined) query.where('r.building_id', buildingId);
        if (status !== undefined) query.where('res.status', status);
        // Przedziały półotwarte: start < to AND end > from.
        if (from !== undefined) query.where('res.end_time', '>', from);
        if (to !== undefined) query.where('res.start_time', '<', to);
      });
      const descending = sort.startsWith('-');
      const column = SORT_COLUMNS[descending ? sort.slice(1) : sort];
      if (!column) throw new Error('Unsupported reservation sort');
      const [rows, count] = await Promise.all([
        base.clone().orderBy(column, descending ? 'desc' : 'asc').orderBy('res.id', 'asc')
          .limit(limit).offset((page - 1) * limit),
        base.clone().clearSelect().count({ total: 'res.id' }).first(),
      ]);
      return { items: rows.map(toReservation), total: Number(count.total) };
    },
    // Bez paginacji: reguła kolizji musi sprawdzić wszystkie rezerwacje sali.
    async list({ roomId } = {}) {
      const query = withRelations().orderBy('res.id');
      if (roomId !== undefined) query.where('res.room_id', roomId);
      return (await query).map(toReservation);
    },
    async findById(id) {
      return toReservation(await withRelations().where('res.id', id).first());
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
