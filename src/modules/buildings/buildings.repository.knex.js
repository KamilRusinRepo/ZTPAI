function toBuilding(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, address: row.address, createdAt: row.created_at.toISOString() };
}

export function createBuildingsRepository(db) {
  return {
    async update(id, data) {
      const [row] = await db('buildings').where({ id }).update(data).returning('*');
      return toBuilding(row);
    },
    async remove(id) { return (await db('buildings').where({ id }).delete()) > 0; },
    async listWithRoomsCount() {
      const rows = await db('buildings as b').leftJoin('rooms as r', 'r.building_id', 'b.id')
        .select('b.*').count({ rooms_count: 'r.id' }).groupBy('b.id').orderBy('b.id');
      return rows.map((row) => ({ ...toBuilding(row), roomsCount: Number(row.rooms_count) }));
    },
    async list() { return (await db('buildings').orderBy('id')).map(toBuilding); },
    async findById(id) { return toBuilding(await db('buildings').where({ id }).first()); },
    async create({ name, address }) {
      const [row] = await db('buildings').insert({ name, address }).returning('*');
      return toBuilding(row);
    },
  };
}
