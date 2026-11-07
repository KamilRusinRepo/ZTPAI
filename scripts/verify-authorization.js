import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import knex from 'knex';
import config from '../knexfile.js';
import { createApp } from '../src/app.js';
import { up as createTables } from '../src/db/migrations/20261031000100_create_buildings_rooms_reservations.js';
import { up as preventOverlap } from '../src/db/migrations/20261103000100_reservations_no_overlap.js';
import { up as createUsers } from '../src/db/migrations/20261106000100_create_users.js';
import { up as migrateOwners } from '../src/db/migrations/20261106000200_reservations_user_id.js';
import { createUsersRepository } from '../src/modules/auth/users.repository.knex.js';
import { createRoomsRepository } from '../src/modules/rooms/rooms.repository.knex.js';
import { createBuildingsRepository } from '../src/modules/buildings/buildings.repository.knex.js';
import { createReservationsRepository } from '../src/modules/reservations/reservations.repository.knex.js';
import { createReservationsUnitOfWork } from '../src/modules/reservations/reservations.unit-of-work.knex.js';
import { seedAuthorizationFixture, loginAuthorizationActors, runAuthorizationMatrix } from '../tests/helpers/authorization-matrix.js';

const schema = 'verify_authorization_' + randomUUID().replaceAll('-', '');
const adminDb = knex(config);
let db;
let server;
try {
  await adminDb.raw('CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public');
  await adminDb.schema.createSchema(schema);
  db = knex({ ...config, searchPath: [schema, 'public'] });
  await db.transaction(async (trx) => {
    await createTables(trx);
    await preventOverlap(trx);
    await createUsers(trx);
    await migrateOwners(trx);
  });
  await db('buildings').insert({ name: 'Authorization fixture', address: 'Fixture address' });
  await db('rooms').insert({ building_id: 1, name: 'Fixture room', capacity: 30 });
  const usersRepository = createUsersRepository(db);
  const roomsRepository = createRoomsRepository(db);
  const buildingsRepository = createBuildingsRepository(db);
  const reservationsRepository = createReservationsRepository(db);
  const fixture = await seedAuthorizationFixture({ usersRepository, reservationsRepository });
  server = createApp({ jwtSecret: randomBytes(48).toString('base64'), usersRepository,
    roomsRepository, buildingsRepository, reservationsRepository,
    runInTransaction: createReservationsUnitOfWork(db), now: () => new Date('2026-11-06T12:00:00Z'),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const actors = await loginAuthorizationActors(baseUrl, fixture);
  const records = [];
  const matrix = await runAuthorizationMatrix({ baseUrl, actors, fixture, record: (result) => records.push(result) });
  const table = [
    '| Endpoint / przypadek | Brak tokenu | USER właściciel | USER obcy | ADMIN |',
    '| --- | --- | --- | --- | --- |',
    ...matrix.map(({ label, statuses }) => `| ${label} | ${statuses.join(' | ')} |`),
  ].join('\n') + '\n';
  console.log(table);
  console.log(`PostgreSQL: ${records.length} HTTP requests from docs/authorization.http passed.`);
  if (process.argv.includes('--save')) {
    mkdirSync('docs', { recursive: true });
    writeFileSync('docs/authorization-matrix.md', table);
    writeFileSync('docs/authorization-http-results.txt', records.map((row) => JSON.stringify(row, null, 2)).join('\n\n') + '\n');
    writeFileSync('docs/authorization-http-summary.txt', records.map((row) =>
      `${row.actor.padEnd(9)} ${row.method.padEnd(6)} ${row.path} -> ${row.status} [${row.response?.error?.requestId ?? 'OK'}]`).join('\n') + '\n');
  }
} finally {
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  if (db) {
    for (const table of ['reservations', 'rooms', 'buildings', 'users']) await db.schema.dropTableIfExists(table);
    await db.destroy();
  }
  await adminDb.schema.dropSchemaIfExists(schema);
  await adminDb.destroy();
}
