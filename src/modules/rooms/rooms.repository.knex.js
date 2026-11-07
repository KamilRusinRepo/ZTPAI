function toRoom(row) {
  if (!row) return null;
  return { id: row.id, buildingId: row.building_id, name: row.name,
    capacity: row.capacity, createdAt: row.created_at.toISOString(),
    ...(row.building_name === undefined ? {} : {
      building: { id: row.building_id, name: row.building_name },
    }) };
}

export function createRoomsRepository(db) {
  return {
    async update(id, data) {
      const changes = {};
      if (data.name !== undefined) changes.name = data.name;
      if (data.capacity !== undefined) changes.capacity = data.capacity;
      if (data.buildingId !== undefined) changes.building_id = data.buildingId;
      const [row] = await db('rooms').where({ id }).update(changes).returning('*');
      return toRoom(row);
    },
    async remove(id) { return (await db('rooms').where({ id }).delete()) > 0; },
    async lockById(id) {
      // Sala istnieje również wtedy, gdy nie ma jeszcze żadnych rezerwacji.
      return toRoom(await db('rooms').where({ id }).forUpdate().first());
    },
    async list() {
      return (await db('rooms').orderBy('id')).map(toRoom);
    },
    async findById(id) {
      return toRoom(await db('rooms as r').join('buildings as b', 'b.id', 'r.building_id')
        .select('r.*', 'b.name as building_name').where('r.id', id).first());
    },
    async listByBuildingId(buildingId) {
      return (await db('rooms as r').join('buildings as b', 'b.id', 'r.building_id')
        .select('r.*', 'b.name as building_name')
        .where('r.building_id', buildingId).orderBy('r.id')).map(toRoom);
    },
    async create({ buildingId, name, capacity }) {
      const [row] = await db('rooms').insert({ building_id: buildingId, name, capacity }).returning('*');
      return toRoom(row);
    },
  };
}
