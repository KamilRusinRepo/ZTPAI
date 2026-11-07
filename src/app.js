import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { createOpenapiDocument } from './docs/openapi.js';
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
import { authenticate } from './middleware/authenticate.js';

export function createApp({ roomsRepository, reservationsRepository, buildingsRepository, usersRepository, jwtSecret, jwtExpiresIn = '15m', runInTransaction, enableDebugRoutes = false, now }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger);
  const requireAuth = authenticate(jwtSecret);
  // Authenticate before parsing protected bodies, including malformed JSON.
  app.use((req, res, next) => {
    const publicAuth = req.method === 'POST' && /^\/api\/auth\/(register|login)\/?$/i.test(req.path);
    const publicDocs = /^\/api\/docs(?:\/|$)/i.test(req.path);
    return publicAuth || publicDocs ? next() : requireAuth(req, res, next);
  });
  app.use(express.json());
  const openapiDocument = createOpenapiDocument({ jwtExpiresIn, enableDebugRoutes });
  app.get('/api/docs/openapi.json', (req, res) => res.json(openapiDocument));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument, {
    customSiteTitle: 'Room Booking API — Swagger UI',
    swaggerOptions: { url: '/api/docs/openapi.json', persistAuthorization: false },
  }));
  if (usersRepository) {
    const authService = createAuthService({ usersRepository, jwtSecret, jwtExpiresIn });
    app.use('/api/auth', createAuthRouter(createAuthController(authService), requireAuth));
  }
  const roomsService = createRoomsService({ roomsRepository, buildingsRepository, reservationsRepository });
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
