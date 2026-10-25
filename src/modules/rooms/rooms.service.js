import { NotFoundError } from '../../errors/AppError.js';

export function createRoomsService({ roomsRepository }) {
  return {
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
