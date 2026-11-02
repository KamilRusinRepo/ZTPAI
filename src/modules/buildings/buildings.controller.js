import { toBuildingResponse } from './buildings.mapper.js';

export function createBuildingsController(service) {
  return {
    async list(req, res) { return res.json((await service.listBuildings()).map(toBuildingResponse)); },
    async getById(req, res) { return res.json(toBuildingResponse(await service.getBuilding(req.validated.params.id))); },
    async create(req, res) {
      const building = await service.createBuilding(req.validated.body);
      return res.location(`/api/buildings/${building.id}`).status(201).json(toBuildingResponse(building));
    },
  };
}
