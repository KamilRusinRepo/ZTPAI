import { NotFoundError } from '../../errors/AppError.js';

export function createRoomsService({ roomsRepository, buildingsRepository }) {
  return {
    async createRoom(data) {
      if (!await buildingsRepository.findById(data.buildingId)) throw new NotFoundError('Building');
      return roomsRepository.create(data);
    },
    async listRooms() {
      return roomsRepository.list();
    },
    async getRoom(id) {
      const room = await roomsRepository.findById(id);
      if (!room) throw new NotFoundError('Room');
      return room;
    },
  };
}
