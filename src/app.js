import express from 'express';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { createRoomsService } from './modules/rooms/rooms.service.js';
import { createRoomsController } from './modules/rooms/rooms.controller.js';
import { createRoomsRouter } from './modules/rooms/rooms.routes.js';
import { createReservationsService } from './modules/reservations/reservations.service.js';
import { createReservationsController } from './modules/reservations/reservations.controller.js';
import { createReservationsRouter } from './modules/reservations/reservations.routes.js';
import { createBuildingsService } from './modules/buildings/buildings.service.js';
import { createBuildingsController } from './modules/buildings/buildings.controller.js';
import { createBuildingsRouter } from './modules/buildings/buildings.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createAuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';

export function createApp({ roomsRepository, reservationsRepository, buildingsRepository, usersRepository, runInTransaction, enableDebugRoutes = false, now }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(express.json());
  if (usersRepository) {
    app.use('/api/auth', createAuthRouter(createAuthController(createAuthService({ usersRepository }))));
  }
  const roomsService = createRoomsService({ roomsRepository, buildingsRepository });
  const reservationsService = createReservationsService({ roomsRepository, reservationsRepository, runInTransaction, now });
  app.use('/api/rooms', createRoomsRouter(createRoomsController(roomsService)));
  app.use('/api/reservations', createReservationsRouter(createReservationsController(reservationsService)));
  if (buildingsRepository) {
    app.use('/api/buildings', createBuildingsRouter(createBuildingsController(createBuildingsService({ buildingsRepository, roomsRepository }))));
  }
  // Tymczasowy endpoint do demonstracji 500 w sprawozdaniu.
  if (enableDebugRoutes) {
    app.get('/api/debug/error', async () => {
      throw new Error('boom');
    });
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
