import { ConflictError } from '../../errors/AppError.js';

export function createRoomsRepository({ buildingsRepository } = {}) {
  const rooms = [
    { id: 1, buildingId: 1, name: 'A101', capacity: 30 },
    { id: 2, buildingId: 1, name: 'A102', capacity: 20 },
    { id: 3, buildingId: 2, name: 'B201', capacity: 50 },
    { id: 4, buildingId: 2, name: 'B202', capacity: 10 },
  ];
  async function withBuilding(room) {
    if (!room) return null;
    const result = structuredClone(room);
    if (buildingsRepository) {
      const building = await buildingsRepository.findById(room.buildingId);
      result.building = { id: building.id, name: building.name };
    }
    return result;
  }
  return {
    async listByBuildingId(buildingId) {
      return Promise.all(rooms.filter((room) => room.buildingId === buildingId).map(withBuilding));
    },
    async create(data) {
      if (rooms.some((room) => room.buildingId === data.buildingId && room.name === data.name)) {
        throw new ConflictError('Resource already exists', 'UNIQUE_VIOLATION');
      }
      const room = { ...structuredClone(data), id: Math.max(0, ...rooms.map((item) => item.id)) + 1 };
      rooms.push(room);
      return structuredClone(room);
    },
    async list() {
      return structuredClone(rooms);
    },
    async findById(id) {
      return withBuilding(rooms.find((room) => room.id === id));
    },
  };
}
