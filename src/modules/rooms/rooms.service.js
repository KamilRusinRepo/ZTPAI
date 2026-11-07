import { NotFoundError, ConflictError } from '../../errors/AppError.js';

export function createRoomsService({ roomsRepository, buildingsRepository, reservationsRepository }) {
  return {
    async updateRoom(id, data) {
      if (!await roomsRepository.findById(id)) throw new NotFoundError('Room');
      if (data.buildingId !== undefined && !await buildingsRepository.findById(data.buildingId)) {
        throw new NotFoundError('Building');
      }
      const room = await roomsRepository.update(id, data);
      if (!room) throw new NotFoundError('Room');
      return room;
    },
    async deleteRoom(id) {
      if (!await roomsRepository.findById(id)) throw new NotFoundError('Room');
      if ((await reservationsRepository.list({ roomId: id })).length) {
        throw new ConflictError('Room has reservations', 'RESOURCE_IN_USE');
      }
      if (!await roomsRepository.remove(id)) throw new NotFoundError('Room');
    },
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
