import { toRoomResponse, toRoomDetailsResponse } from './rooms.mapper.js';

export function createRoomsController(roomsService) {
  return {
    async update(req, res) {
      return res.json(toRoomResponse(await roomsService.updateRoom(req.validated.params.id, req.validated.body)));
    },
    async remove(req, res) {
      await roomsService.deleteRoom(req.validated.params.id);
      return res.status(204).end();
    },
    async create(req, res) {
      const room = await roomsService.createRoom(req.validated.body);
      return res.location(`/api/rooms/${room.id}`).status(201).json(toRoomResponse(room));
    },
    async list(req, res) {
      const rooms = await roomsService.listRooms();
      return res.json(rooms.map(toRoomResponse));
    },
    async getById(req, res) {
      const room = await roomsService.getRoom(req.validated.params.id);
      return res.json(toRoomDetailsResponse(room));
    },
  };
}
