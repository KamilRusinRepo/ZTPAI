import { createApp } from './app.js';
import { createRoomsRepository } from './modules/rooms/rooms.repository.memory.js';
import { createReservationsRepository } from './modules/reservations/reservations.repository.memory.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const app = createApp({
  roomsRepository: createRoomsRepository(),
  reservationsRepository: createReservationsRepository(),
});
const server = app.listen(port, () => {
  console.log(`Room Booking API: http://localhost:${port}`);
});
server.on('error', (error) => {
  console.error(`Cannot start API: ${error.message}`);
  process.exitCode = 1;
});
