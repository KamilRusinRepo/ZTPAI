import { NotFoundError, ConflictError } from '../../errors/AppError.js';

export function createBuildingsService({ buildingsRepository, roomsRepository }) {
  return {
    async updateBuilding(id, data) {
      const building = await buildingsRepository.update(id, data);
      if (!building) throw new NotFoundError('Building');
      return building;
    },
    async deleteBuilding(id) {
      if (!await buildingsRepository.findById(id)) throw new NotFoundError('Building');
      if ((await roomsRepository.listByBuildingId(id)).length) {
        throw new ConflictError('Building has rooms', 'RESOURCE_IN_USE');
      }
      if (!await buildingsRepository.remove(id)) throw new NotFoundError('Building');
    },
    async listBuildings() { return buildingsRepository.listWithRoomsCount(roomsRepository); },
    async listRooms(id) {
      if (!await buildingsRepository.findById(id)) throw new NotFoundError('Building');
      return roomsRepository.listByBuildingId(id);
    },
    async getBuilding(id) {
      const building = await buildingsRepository.findById(id);
      if (!building) throw new NotFoundError('Building');
      return building;
    },
    async createBuilding(data) { return buildingsRepository.create(data); },
  };
}
