// Demonstracja wyłącznie na bazie testowej, z tymi samymi zabezpieczeniami co Jest.
import '../tests/setupEnv.js';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import config from '../src/config/index.js';
import { db } from '../src/db/knex.js';
import { createApp } from '../src/app.js';
import { createEventBus } from '../src/events/eventBus.js';
import { registerAuditListeners } from '../src/events/auditListeners.js';
import { registerNotificationListeners } from '../src/events/notificationListeners.js';
import { createAuditLogRepository } from '../src/modules/audit-log/audit-log.repository.knex.js';
import { createBuildingsRepository } from '../src/modules/buildings/buildings.repository.knex.js';
import { createRoomsRepository } from '../src/modules/rooms/rooms.repository.knex.js';
import { createUsersRepository } from '../src/modules/auth/users.repository.knex.js';
import { createReservationsRepository } from '../src/modules/reservations/reservations.repository.knex.js';
import { createReservationsUnitOfWork } from '../src/modules/reservations/reservations.unit-of-work.knex.js';

const failures = [];
const notifications = [];
const logger = {
  error(message, error) { failures.push(message); console.error(message, error.message); },
  log(message) { notifications.push(message); console.log(message); },
};
const eventBus = createEventBus({ logger });
const auditLogRepository = createAuditLogRepository(db);
const usersRepository = createUsersRepository(db);
registerAuditListeners(eventBus, auditLogRepository);
registerNotificationListeners(eventBus, usersRepository, { logger });
const app = createApp({
  buildingsRepository: createBuildingsRepository(db), roomsRepository: createRoomsRepository(db),
  reservationsRepository: createReservationsRepository(db), usersRepository,
  runInTransaction: createReservationsUnitOfWork(db), auditLogRepository, eventBus,
  jwtSecret: config.jwtSecret, now: () => new Date('2026-11-18T09:00:00Z'),
});

try {
  const { rows: [database] } = await db.raw('SELECT current_database() AS name');
  assert.match(database.name, /^room_booking_test(?:_[a-z0-9_]+)?$/);
  console.log('Demonstration database:', database.name, '(development data untouched)');
  await db.migrate.latest();
  await db.raw('TRUNCATE audit_log, reservations, rooms, buildings, users RESTART IDENTITY');
  await db('buildings').insert({ name: 'Audit demo', address: 'Test street' });
  await db('rooms').insert({ building_id: 1, name: 'Audit demo room', capacity: 30 });
  const password = 'audit-demo-password-123';
  const passwordHash = await bcrypt.hash(password, 4);
  await db('users').insert([
    { email: 'owner@audit.example', password_hash: passwordHash, role: 'USER' },
    { email: 'admin@audit.example', password_hash: passwordHash, role: 'ADMIN' },
  ]);
  const login = async (email) => {
    const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    return response.body.accessToken;
  };
  const owner = await login('owner@audit.example');
  const admin = await login('admin@audit.example');
  const input = { roomId: 1, participants: 5, startTime: '2035-01-01T10:00:00Z', endTime: '2035-01-01T11:00:00Z' };
  const create = (body = input) => request(app).post('/api/reservations').auth(owner, { type: 'bearer' }).send(body);
  const created = await create().expect(201);
  await create().expect(409);
  const cancel = () => request(app).patch(`/api/reservations/${created.body.id}/cancel`).auth(admin, { type: 'bearer' });
  const first = await cancel().expect(200);
  assert.deepEqual((await cancel().expect(200)).body, first.body);
  await eventBus.flush();
  const entries = await db('audit_log').select('id', 'event_type', 'payload', 'created_at').orderBy('id');
  assert.equal(entries.length, 2);
  assert.equal(notifications.length, 1);
  console.log('Scenario create 201 -> collision 409 -> ADMIN cancel 200 -> repeat 200: PASS');
  console.log('audit_log (exactly two entries):\n' + JSON.stringify(entries, null, 2));
  const page = await request(app).get('/api/admin/audit-log').auth(admin, { type: 'bearer' }).expect(200);
  assert.equal(page.body.meta.total, 2);
  console.log('GET /api/admin/audit-log:\n' + JSON.stringify(page.body, null, 2));

  const originalCreate = auditLogRepository.create;
  auditLogRepository.create = async () => { throw new Error('DEMO: temporary audit listener failure'); };
  let accepted;
  try {
    accepted = await create().expect(201); // Poprzednia rezerwacja jest CANCELLED.
    await eventBus.flush();
    assert.equal(failures.length, 1);
    assert.equal((await db('reservations').where({ id: accepted.body.id }).first()).status, 'CONFIRMED');
    assert.equal((await db('audit_log')).length, 2);
    console.log('Failing audit listener: HTTP 201, reservation persisted, error logged: PASS');
  } finally { auditLogRepository.create = originalCreate; }
  await create({ ...input, startTime: '2035-01-02T10:00:00Z', endTime: '2035-01-02T11:00:00Z' }).expect(201);
  await eventBus.flush();
  assert.equal((await db('audit_log')).length, 3);
  console.log('Normal audit listener restored; next operation saved its event: PASS');
} finally {
  try { await eventBus.flush(); } finally { await db.destroy(); }
}
