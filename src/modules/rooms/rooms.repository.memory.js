import { ConflictError } from '../../errors/AppError.js';

export function createRoomsRepository({ buildingsRepository } = {}) {
  const rooms = [
    { id: 1, buildingId: 1, name: 'A101', capacity: 30 },
    { id: 2, buildingId: 1, name: 'A102', capacity: 20 },
    { id: 3, buildingId: 2, name: 'B201', capacity: 50 },
    { id: 4, buildingId: 2, name: 'B202', capacity: 10 },
  ];
  let nextId = 5;
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
    async update(id, data) {
      const room = rooms.find((item) => item.id === id);
      if (!room) return null;
      const updated = { ...room, ...structuredClone(data) };
      if (rooms.some((item) => item.id !== id && item.buildingId === updated.buildingId && item.name === updated.name)) {
        throw new ConflictError('Resource already exists', 'UNIQUE_VIOLATION');
      }
      Object.assign(room, updated);
      return withBuilding(room);
    },
    async remove(id) {
      const index = rooms.findIndex((room) => room.id === id);
      if (index < 0) return false;
      rooms.splice(index, 1);
      return true;
    },
    async listByBuildingId(buildingId) {
      return Promise.all(rooms.filter((room) => room.buildingId === buildingId).map(withBuilding));
    },
    async create(data) {
      if (rooms.some((room) => room.buildingId === data.buildingId && room.name === data.name)) {
        throw new ConflictError('Resource already exists', 'UNIQUE_VIOLATION');
      }
      const room = { ...structuredClone(data), id: nextId++ };
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
