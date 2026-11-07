import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import knex from 'knex';
import jwt from 'jsonwebtoken';
import config from '../knexfile.js';
import { up as createTables } from '../src/db/migrations/20261031000100_create_buildings_rooms_reservations.js';
import { up as preventOverlap } from '../src/db/migrations/20261103000100_reservations_no_overlap.js';
import { up as createUsers } from '../src/db/migrations/20261106000100_create_users.js';
import { up as migrateOwners, down as rollbackOwners } from '../src/db/migrations/20261106000200_reservations_user_id.js';
import { seed as seedUsers } from '../src/db/seeds/00_users.js';
import { seed as seedRooms } from '../src/db/seeds/01_room_booking.js';
import { createApp } from '../src/app.js';
import { createUsersRepository } from '../src/modules/auth/users.repository.knex.js';
import { createRoomsRepository } from '../src/modules/rooms/rooms.repository.knex.js';
import { createBuildingsRepository } from '../src/modules/buildings/buildings.repository.knex.js';
import { createReservationsRepository } from '../src/modules/reservations/reservations.repository.knex.js';
import { createReservationsUnitOfWork } from '../src/modules/reservations/reservations.unit-of-work.knex.js';

const schema = 'verify_owners_' + randomUUID().replaceAll('-', '');
const adminDb = knex(config);
const jwtSecret = randomBytes(48).toString('base64');
const log = [];
function record(label, value) {
  const line = label + (value === undefined ? '' : '\n' + JSON.stringify(value, null, 2));
  log.push(line);
  console.log(line);
}
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
  });
  await db('buildings').insert({ name: 'Legacy building', address: 'Legacy address' });
  await db('rooms').insert({ building_id: 1, name: 'Legacy room', capacity: 30 });
  await db('reservations').insert(['Jan Kowalski', 'Anna Nowak', 'Jan Kowalski'].map((reserved_by, index) => ({
    room_id: 1, reserved_by, participants: 5, status: 'CONFIRMED',
    start_time: `2030-11-${10 + index}T10:00:00Z`, end_time: `2030-11-${10 + index}T11:00:00Z`,
  })));
  const before = await db('reservations').orderBy('id');
  await db.transaction(migrateOwners);
  const after = await db('reservations').orderBy('id');
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    const { reserved_by, ...oldFields } = before[i];
    const { user_id, ...newFields } = after[i];
    assert.deepEqual(newFields, oldFields);
    assert.ok(user_id);
  }
  assert.equal(after[0].user_id, after[2].user_id);
  assert.notEqual(after[0].user_id, after[1].user_id);
  assert.equal(await db.schema.hasColumn('reservations', 'reserved_by'), false);
  const linked = await db('reservations as r').join('users as u', 'u.id', 'r.user_id')
    .select('r.id', 'r.user_id', 'u.email', 'u.role').orderBy('r.id');
  record('Migration on non-empty database: all reservations preserved; same author -> same user; different authors -> different users.', linked);
  const invalidRow = { room_id: 1, participants: 1, status: 'CANCELLED',
    start_time: '2035-01-01T10:00:00Z', end_time: '2035-01-01T11:00:00Z' };
  await assert.rejects(db('reservations').insert({ ...invalidRow, user_id: 2147483647 }), { code: '23503' });
  await assert.rejects(db('reservations').insert({ ...invalidRow, user_id: null }), { code: '23502' });
  await assert.rejects(db('users').where({ id: after[0].user_id }).delete(), { code: '23503' });
  record('FK user_id, NOT NULL and ON DELETE RESTRICT: OK');
  await db.transaction(rollbackOwners);
  assert.equal((await db('reservations')).length, before.length);
  await db.transaction(migrateOwners);
  assert.equal((await db('reservations')).length, before.length);
  record('Rollback -> reapply on existing data: OK (rollback uses owner emails as display names).');
  await seedUsers(db);
  await seedRooms(db);
  await seedUsers(db);
  await seedRooms(db);
  assert.equal(Number((await db('reservations').count('* as count').first()).count), 5);
  const demo = await db('reservations as r').join('users as u', 'u.id', 'r.user_id')
    .select('r.id', 'u.email').orderBy('r.id');
  assert.equal(demo[0].email, 'jan.kowalski@seed.example.invalid');
  record('Repeated seeds: five reservations assigned to demo users.', demo);
  server = createApp({ jwtSecret, jwtExpiresIn: '10s',
    roomsRepository: createRoomsRepository(db), buildingsRepository: createBuildingsRepository(db),
    usersRepository: createUsersRepository(db), reservationsRepository: createReservationsRepository(db),
    runInTransaction: createReservationsUnitOfWork(db), now: () => new Date('2026-11-06T12:00:00Z'),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  async function request(label, path, { method = 'GET', body, authorization } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = { status: response.status, body: await response.json() };
    if (!result.body.accessToken) record(label, result);
    return result;
  }
  const credentials = { email: 'api-user@example.com', password: 'user-password-123' };
  const registered = await request('Registration remains public', '/api/auth/register', { method: 'POST', body: credentials });
  assert.equal(registered.status, 201);
  const login = await request('Login', '/api/auth/login', { method: 'POST', body: credentials });
  assert.equal(login.status, 200);
  assert.equal(login.body.expiresIn, '10s');
  const token = login.body.accessToken;
  const authorization = `Bearer ${token}`;
  const [header, payload, signature] = token.split('.');
  const changedSignature = (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1);
  const changedPayload = Buffer.from(JSON.stringify({ ...jwt.decode(token), role: 'ADMIN' })).toString('base64url');
  for (const [label, value] of [
    ['Missing Authorization', undefined], ['Basic instead of Bearer', 'Basic abc'], ['Bearer without token', 'Bearer'],
    ['One character changed in signature', `Bearer ${header}.${payload}.${changedSignature}`],
    ['Role changed to ADMIN without resigning', `Bearer ${header}.${changedPayload}.${signature}`],
  ]) {
    const result = await request(label, '/api/rooms', { authorization: value });
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'UNAUTHORIZED');
  }
  const input = { roomId: 1, participants: 2, startTime: '2035-01-01T10:00:00Z', endTime: '2035-01-01T11:00:00Z' };
  for (const extra of [{ userId: registered.body.id }, { reservedBy: 'Forged author' }]) {
    assert.equal((await request('Forged body identity rejected', '/api/reservations', {
      method: 'POST', authorization, body: { ...input, ...extra },
    })).status, 400);
  }
  const created = await request('Create reservation from token identity', '/api/reservations', { method: 'POST', authorization, body: input });
  assert.equal(created.status, 201);
  const expectedUser = { id: registered.body.id, email: registered.body.email };
  assert.deepEqual(created.body.user, expectedUser);
  const stored = await db('reservations').where({ id: created.body.id }).first();
  assert.equal(stored.user_id, expectedUser.id);
  const detail = await request('Reservation details', `/api/reservations/${created.body.id}`, { authorization });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.user, expectedUser);
  const list = await request('Filtered/paginated reservations', '/api/reservations?roomId=1&from=2035-01-01T00:00:00Z&limit=1', { authorization });
  assert.equal(list.status, 200);
  assert.equal(list.body.meta.total, 1);
  assert.deepEqual(list.body.data[0].user, expectedUser);
  assert.equal((await request('Overlap remains rejected', '/api/reservations', { method: 'POST', authorization, body: input })).status, 409);
  const cancelled = await request('Cancel reservation', `/api/reservations/${created.body.id}/cancel`, { method: 'PATCH', authorization });
  assert.equal(cancelled.status, 200);
  assert.deepEqual(cancelled.body.user, expectedUser);
  const repeated = await request('Repeated cancellation', `/api/reservations/${created.body.id}/cancel`, { method: 'PATCH', authorization });
  assert.deepEqual(repeated.body, cancelled.body);
  const remainingMs = Math.max(0, jwt.decode(token).exp * 1000 - Date.now() + 50);
  record('Waiting for the actual 10-second token to expire.');
  await new Promise((resolve) => setTimeout(resolve, remainingMs));
  const expired = await request('Expired token after JWT_EXPIRES_IN=10s', '/api/rooms', { authorization });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error.message, 'Token expired');
  record('All PostgreSQL migration and authentication checks passed.');
  if (process.argv.includes('--save')) {
    mkdirSync('docs', { recursive: true });
    writeFileSync('docs/auth-reservations-results.txt', log.join('\n\n') + '\n');
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
