import { toBuildingResponse } from './buildings.mapper.js';
import { toRoomDetailsResponse } from '../rooms/rooms.mapper.js';

export function createBuildingsController(service) {
  return {
    async update(req, res) {
      return res.json(toBuildingResponse(await service.updateBuilding(req.validated.params.id, req.validated.body)));
    },
    async remove(req, res) {
      await service.deleteBuilding(req.validated.params.id);
      return res.status(204).end();
    },
    async listRooms(req, res) {
      return res.json((await service.listRooms(req.validated.params.id)).map(toRoomDetailsResponse));
    },
    async list(req, res) { return res.json((await service.listBuildings()).map(toBuildingResponse)); },
    async getById(req, res) { return res.json(toBuildingResponse(await service.getBuilding(req.validated.params.id))); },
    async create(req, res) {
      const building = await service.createBuilding(req.validated.body);
      return res.location(`/api/buildings/${building.id}`).status(201).json(toBuildingResponse(building));
    },
  };
}
