import { ConflictError } from '../../errors/AppError.js';

export function createBuildingsRepository() {
  const buildings = [
    { id: 1, name: 'Budynek A', address: 'ul. Warszawska 24, Kraków' },
    { id: 2, name: 'Budynek B', address: 'ul. Warszawska 25, Kraków' },
  ];
  let nextId = 3;
  return {
    async listWithRoomsCount(roomsRepository) {
      const counts = new Map();
      for (const room of await roomsRepository.list()) {
        counts.set(room.buildingId, (counts.get(room.buildingId) ?? 0) + 1);
      }
      return structuredClone(buildings.map((building) => ({ ...building, roomsCount: counts.get(building.id) ?? 0 })));
    },
    async list() { return structuredClone(buildings); },
    async findById(id) { return structuredClone(buildings.find((item) => item.id === id) ?? null); },
    async create(data) {
      if (buildings.some((item) => item.name === data.name)) {
        throw new ConflictError('Resource already exists', 'UNIQUE_VIOLATION');
      }
      const building = { ...structuredClone(data), id: nextId++, createdAt: new Date().toISOString() };
      buildings.push(building);
      return structuredClone(building);
    },
  };
}
