import { createRoomsRepository } from '../rooms/rooms.repository.knex.js';
import { createReservationsRepository } from './reservations.repository.knex.js';

export function createReservationsUnitOfWork(db) {
  return (operation) => db.transaction(async (trx) => operation({
    roomsRepository: createRoomsRepository(trx),
    reservationsRepository: createReservationsRepository(trx),
  }));
}
