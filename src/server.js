import { createApp } from './app.js';
import { loadAuthConfig } from './config/auth.js';

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const authConfig = loadAuthConfig(process.env);
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const driver = process.env.REPOSITORY_DRIVER ?? 'knex';
if (!['knex', 'memory'].includes(driver)) throw new Error('REPOSITORY_DRIVER must be knex or memory');

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
const runInTransaction = db
  ? (await import('./modules/reservations/reservations.unit-of-work.knex.js')).createReservationsUnitOfWork(db)
  : undefined;
const app = createApp({
  ...authConfig,
  usersRepository: createUsersRepository(db),
  runInTransaction,
  roomsRepository,
  reservationsRepository: createReservationsRepository(db ?? {
    seedStartedReservation: process.env.SEED_STARTED_RESERVATION === 'true',
    roomsRepository,
  }),
  buildingsRepository,
  enableDebugRoutes: process.env.ENABLE_DEBUG_ROUTES === 'true',
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
