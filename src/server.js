import { createApp } from './app.js';
import config from './config/index.js';
import { createAuthService } from './modules/auth/auth.service.js';

const { port, repositoryDriver: driver } = config;

// Repository implementation is selected only here.
const [{ createRoomsRepository }, { createReservationsRepository }, { createBuildingsRepository }, { createUsersRepository }] = await Promise.all([
  import('./modules/rooms/rooms.repository.' + driver + '.js'),
  import('./modules/reservations/reservations.repository.' + driver + '.js'),
  import('./modules/buildings/buildings.repository.' + driver + '.js'),
  import('./modules/auth/users.repository.' + driver + '.js'),
]);
const db = driver === 'knex' ? (await import('./db/knex.js')).db : null;
if (db) {
  try { await db.raw('SELECT 1'); }
  catch (error) { await db.destroy(); throw error; }
}
const buildingsRepository = createBuildingsRepository(db);
const roomsRepository = createRoomsRepository(db ?? { buildingsRepository });
const usersRepository = createUsersRepository(db);
const demoUser = driver === 'memory' && config.seedStartedReservation
  ? await createAuthService({ usersRepository }).register({
    email: 'jan.kowalski@seed.example.invalid', password: 'user-password-123',
  }) : null;
const runInTransaction = db
  ? (await import('./modules/reservations/reservations.unit-of-work.knex.js')).createReservationsUnitOfWork(db)
  : undefined;
const app = createApp({
  jwtSecret: config.jwtSecret,
  jwtExpiresIn: config.jwtExpiresIn,
  usersRepository,
  runInTransaction,
  roomsRepository,
  reservationsRepository: createReservationsRepository(db ?? {
    seedStartedReservation: config.seedStartedReservation,
    roomsRepository,
    usersRepository,
    seedUserId: demoUser?.id,
  }),
  buildingsRepository,
  enableDebugRoutes: config.enableDebugRoutes,
});
const server = app.listen(port, () => {
  console.log('Room Booking API (' + driver + '): http://localhost:' + port);
});
server.on('error', async (error) => {
  console.error('Cannot start API: ' + error.message);
  if (db) await db.destroy();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async () => { if (db) await db.destroy(); });
  });
}
