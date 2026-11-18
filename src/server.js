import { createApp } from './app.js';
import config from './config/index.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createEventBus } from './events/eventBus.js';
import { registerAuditListeners } from './events/auditListeners.js';
import { registerNotificationListeners } from './events/notificationListeners.js';

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
const { createAuditLogRepository } = await import('./modules/audit-log/audit-log.repository.' + driver + '.js');
const auditLogRepository = createAuditLogRepository(db);
const eventBus = createEventBus();
registerAuditListeners(eventBus, auditLogRepository);
registerNotificationListeners(eventBus, usersRepository);
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
  auditLogRepository,
  eventBus,
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
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  try {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    console.log('HTTP server closed; active requests finished');
    await eventBus.flush();
    console.log('Event listeners finished');
  } catch (error) {
    console.error('Cannot close HTTP server: ' + error.message);
    process.exitCode = 1;
  } finally {
    try {
      if (db) {
        await db.destroy();
        console.log('Database connection pool closed');
      }
    } catch (error) {
      console.error('Cannot close database pool: ' + error.message);
      process.exitCode = 1;
    }
    console.log('Shutdown complete');
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void shutdown(signal); });
}
