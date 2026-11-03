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
