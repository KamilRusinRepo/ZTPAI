import { toRoomResponse } from './rooms.mapper.js';

export function createRoomsController(roomsService) {
  return {
    async list(req, res) {
      const rooms = await roomsService.listRooms();
      return res.json(rooms.map(toRoomResponse));
    },
    async getById(req, res) {
      const room = await roomsService.getRoom(req.validated.params.id);
      return res.json(toRoomResponse(room));
    },
  };
}
