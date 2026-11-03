import { NotFoundError } from '../../errors/AppError.js';

export function createBuildingsService({ buildingsRepository, roomsRepository }) {
  return {
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
