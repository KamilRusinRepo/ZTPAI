import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import config from '../../src/config/index.js';
import { db } from '../../src/db/knex.js';
import { createApp } from '../../src/app.js';
import { createEventBus } from '../../src/events/eventBus.js';
import { registerAuditListeners } from '../../src/events/auditListeners.js';
import { registerNotificationListeners } from '../../src/events/notificationListeners.js';
import { createAuditLogRepository } from '../../src/modules/audit-log/audit-log.repository.knex.js';
import { createBuildingsRepository } from '../../src/modules/buildings/buildings.repository.knex.js';
import { createRoomsRepository } from '../../src/modules/rooms/rooms.repository.knex.js';
import { createUsersRepository } from '../../src/modules/auth/users.repository.knex.js';
import { createReservationsRepository } from '../../src/modules/reservations/reservations.repository.knex.js';
import { createReservationsUnitOfWork } from '../../src/modules/reservations/reservations.unit-of-work.knex.js';

const NOW = '2026-11-01T09:00:00.000Z';
const PASSWORD = 'audit-integration-password';
let passwordHash;
let app;
let eventBus;
let auditLogRepository;
let logger;
let ownerToken;
let adminToken;
const booking = (day = '02') => ({ roomId: 1, participants: 5,
  startTime: `2026-11-${day}T10:00:00.000Z`, endTime: `2026-11-${day}T11:00:00.000Z` });

const create = (token = ownerToken, day) => request(app).post('/api/reservations')
  .auth(token, { type: 'bearer' }).send(booking(day));
const cancel = (id, token = adminToken) => request(app).patch(`/api/reservations/${id}/cancel`)
  .auth(token, { type: 'bearer' });
const audit = (query = {}) => request(app).get('/api/admin/audit-log')
  .auth(adminToken, { type: 'bearer' }).query(query);

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  expect((await db.raw('SELECT current_database() AS name')).rows[0].name)
    .toMatch(/^room_booking_test(?:_[a-z0-9_]+)?$/);
  await db.migrate.latest();
  // Niski koszt wyłącznie dla fixture; aplikacja nadal używa bcrypt z kosztem 12.
  passwordHash = await bcrypt.hash(PASSWORD, 4);
}, 30000);

beforeEach(async () => {
  await db.raw('TRUNCATE audit_log, reservations, rooms, buildings, users RESTART IDENTITY');
  await db('buildings').insert({ name: 'Audit building', address: 'Audit street 1' });
  await db('rooms').insert({ building_id: 1, name: 'Audit room', capacity: 30 });
  await db('users').insert([
    { email: 'owner@audit.example', password_hash: passwordHash, role: 'USER' },
    { email: 'admin@audit.example', password_hash: passwordHash, role: 'ADMIN' },
  ]);
  logger = { log: jest.fn(), error: jest.fn() };
  eventBus = createEventBus({ logger, now: () => new Date(NOW) });
  auditLogRepository = createAuditLogRepository(db);
  const usersRepository = createUsersRepository(db);
  registerAuditListeners(eventBus, auditLogRepository);
  registerNotificationListeners(eventBus, usersRepository, { logger });
  app = createApp({
    buildingsRepository: createBuildingsRepository(db), roomsRepository: createRoomsRepository(db),
    usersRepository, reservationsRepository: createReservationsRepository(db),
    runInTransaction: createReservationsUnitOfWork(db), auditLogRepository, eventBus,
    jwtSecret: config.jwtSecret, now: () => new Date(NOW),
  });
  const login = async (email) => {
    const result = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    return result.body.accessToken;
  };
  ownerToken = await login('owner@audit.example');
  adminToken = await login('admin@audit.example');
});

afterEach(async () => { await eventBus?.flush(); });
afterAll(async () => {
  try { await eventBus?.flush(); } finally {
    try { await db.destroy(); } finally { jest.restoreAllMocks(); }
  }
});

describe('Audit log po rzeczywistych transakcjach PostgreSQL', () => {
  test('create → kolizja → cancel przez ADMIN → ponowienie: dokładnie dwa eventy i jedno powiadomienie', async () => {
    const created = await create().expect(201);
    await create().expect(409);
    const first = await cancel(created.body.id).expect(200);
    expect((await cancel(created.body.id).expect(200)).body).toEqual(first.body);
    await eventBus.flush();
    const rows = await db('audit_log').orderBy('id');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ event_type: 'reservation.created', payload: {
      reservationId: created.body.id, roomId: 1, userId: 1,
      startTime: booking().startTime, endTime: booking().endTime,
    } });
    expect(rows[1]).toMatchObject({ event_type: 'reservation.cancelled', payload: {
      reservationId: created.body.id, roomId: 1, userId: 1, cancelledBy: 2,
    } });
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('[notification] to: owner@audit.example'));
    const response = await audit().expect(200);
    expect(response.body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    expect(response.body.data.map((entry) => entry.eventType)).toEqual(['reservation.cancelled', 'reservation.created']);
    expect(response.body.data[0].payload.cancelledBy).toBe(2);
    expect(response.body.data[0].createdAt).toBe(NOW);
    const type = await db.raw("SELECT data_type FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'payload'");
    expect(type.rows[0].data_type).toBe('jsonb');
  });

  test('401 bez tokenu i 403 dla USER, nawet przy błędnych parametrach', async () => {
    const anonymous = await request(app).get('/api/admin/audit-log').expect(401);
    expect(anonymous.body.error.code).toBe('UNAUTHORIZED');
    const user = await request(app).get('/api/admin/audit-log?page=0')
      .auth(ownerToken, { type: 'bearer' }).expect(403);
    expect(user.body.error.code).toBe('FORBIDDEN');
  });

  test('paginacja i stabilne sortowanie od najnowszych, także dla identycznego createdAt', async () => {
    for (const day of ['02', '03', '04']) await create(ownerToken, day).expect(201);
    await eventBus.flush();
    const first = await audit({ limit: 2 }).expect(200);
    const second = await audit({ limit: 2, page: 2 }).expect(200);
    expect(first.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(second.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(first.body.data.map((entry) => entry.id)).toEqual(['3', '2']);
    expect(second.body.data.map((entry) => entry.id)).toEqual(['1']);
    const empty = await audit({ page: 99, limit: 2 }).expect(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.meta.total).toBe(3);
  });

  test('filtr eventType zawęża dane i total, nieznana nazwa daje pustą listę', async () => {
    const created = await create().expect(201);
    await cancel(created.body.id).expect(200);
    await eventBus.flush();
    const response = await audit({ eventType: 'reservation.cancelled', limit: 1 }).expect(200);
    expect(response.body.meta.total).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].eventType).toBe('reservation.cancelled');
    const empty = await audit({ eventType: 'unknown' }).expect(200);
    expect(empty.body).toMatchObject({ data: [], meta: { total: 0, totalPages: 0 } });
  });

  test.each([{ page: 0 }, { limit: 101 }, { page: 'abc' }, { eventType: ['a', 'b'] }])(
    'walidacja query %j zwraca 400 z details', async (query) => {
      const response = await audit(query).expect(400);
      expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([expect.objectContaining({ location: 'query' })]) });
    },
  );

  test('tymczasowy wyjątek listenera audytu: POST nadal 201, rekord istnieje i błąd jest w logach', async () => {
    const failure = new Error('DEMO: audit listener failed');
    const spy = jest.spyOn(auditLogRepository, 'create').mockRejectedValueOnce(failure);
    try {
      const created = await create().expect(201);
      await eventBus.flush();
      expect(await db('reservations').where({ id: created.body.id }).first()).toMatchObject({ status: 'CONFIRMED' });
      expect(await db('audit_log')).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledWith('[event:reservation.created] handler failed', failure);
    } finally { spy.mockRestore(); }
    await create(ownerToken, '03').expect(201);
    await eventBus.flush();
    expect(await db('audit_log')).toHaveLength(1);
  });

  test('anulowanie własnej rezerwacji przez USER lub ADMIN nie wysyła powiadomienia', async () => {
    const owner = await create().expect(201);
    await cancel(owner.body.id, ownerToken).expect(200);
    const admin = await create(adminToken, '03').expect(201);
    await cancel(admin.body.id, adminToken).expect(200);
    await eventBus.flush();
    expect(logger.log).not.toHaveBeenCalled();
    expect(await db('audit_log')).toHaveLength(4);
  });

  test('równoległe anulowania w PostgreSQL dają tylko jeden event i jedno powiadomienie', async () => {
    const created = await create().expect(201);
    const results = await Promise.all([cancel(created.body.id), cancel(created.body.id)]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
    await eventBus.flush();
    expect(await db('audit_log').where({ event_type: 'reservation.cancelled' })).toHaveLength(1);
    expect(logger.log).toHaveBeenCalledTimes(1);
  });
});
