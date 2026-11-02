function toRoom(row) {
  if (!row) return null;
  return { id: row.id, buildingId: row.building_id, name: row.name,
    capacity: row.capacity, createdAt: row.created_at.toISOString() };
}

export function createRoomsRepository(db) {
  return {
    async list() {
      return (await db('rooms').orderBy('id')).map(toRoom);
    },
    async findById(id) {
      return toRoom(await db('rooms').where({ id }).first());
    },
    async create({ buildingId, name, capacity }) {
      const [row] = await db('rooms').insert({ building_id: buildingId, name, capacity }).returning('*');
      return toRoom(row);
    },
  };
}
