import express from 'express';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { createRoomsService } from './modules/rooms/rooms.service.js';
import { createRoomsController } from './modules/rooms/rooms.controller.js';
import { createRoomsRouter } from './modules/rooms/rooms.routes.js';
import { createReservationsService } from './modules/reservations/reservations.service.js';
import { createReservationsController } from './modules/reservations/reservations.controller.js';
import { createReservationsRouter } from './modules/reservations/reservations.routes.js';

export function createApp({ roomsRepository, reservationsRepository }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  const roomsService = createRoomsService({ roomsRepository });
  const reservationsService = createReservationsService({ roomsRepository, reservationsRepository });
  app.use('/api/rooms', createRoomsRouter(createRoomsController(roomsService)));
  app.use('/api/reservations', createReservationsRouter(createReservationsController(reservationsService)));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
