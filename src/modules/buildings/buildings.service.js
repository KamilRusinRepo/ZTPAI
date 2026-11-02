import { NotFoundError } from '../../errors/AppError.js';

export function createBuildingsService({ buildingsRepository }) {
  return {
    async listBuildings() { return buildingsRepository.list(); },
    async getBuilding(id) {
      const building = await buildingsRepository.findById(id);
      if (!building) throw new NotFoundError('Building');
      return building;
    },
    async createBuilding(data) { return buildingsRepository.create(data); },
  };
}
