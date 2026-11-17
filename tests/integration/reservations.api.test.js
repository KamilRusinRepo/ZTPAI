import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import config from '../../src/config/index.js';
import { db } from '../../src/db/knex.js';
import { createApp } from '../../src/app.js';
import { createBuildingsRepository } from '../../src/modules/buildings/buildings.repository.knex.js';
import { createRoomsRepository } from '../../src/modules/rooms/rooms.repository.knex.js';
import { createUsersRepository } from '../../src/modules/auth/users.repository.knex.js';
import { createReservationsRepository } from '../../src/modules/reservations/reservations.repository.knex.js';
import { createReservationsUnitOfWork } from '../../src/modules/reservations/reservations.unit-of-work.knex.js';

const NOW = '2026-11-01T09:00:00.000Z';
const PASSWORD = 'integration-password-123';
const app = createApp({
  buildingsRepository: createBuildingsRepository(db),
  roomsRepository: createRoomsRepository(db),
  usersRepository: createUsersRepository(db),
  reservationsRepository: createReservationsRepository(db),
  runInTransaction: createReservationsUnitOfWork(db),
  jwtSecret: config.jwtSecret,
  jwtExpiresIn: config.jwtExpiresIn,
  now: () => new Date(NOW),
});

const booking = (changes = {}) => ({
  roomId: 1, participants: 10,
  startTime: '2026-11-02T10:00:00.000Z',
  endTime: '2026-11-02T12:00:00.000Z',
  ...changes,
});

async function registerAndLogin(email = 'owner@integration.example') {
  const credentials = { email, password: PASSWORD };
  const registered = await request(app).post('/api/auth/register').send(credentials).expect(201);
  const login = await request(app).post('/api/auth/login').send(credentials).expect(200);
  expect(login.body).toMatchObject({ accessToken: expect.any(String), tokenType: 'Bearer' });
  return { user: registered.body, token: login.body.accessToken };
}

const createReservation = (token, input = booking()) => request(app)
  .post('/api/reservations').auth(token, { type: 'bearer' }).send(input);

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const { rows: [row] } = await db.raw('SELECT current_database() AS name');
  // Druga kontrola, już po połączeniu, przed migracjami i TRUNCATE.
  expect(row.name).toMatch(/^room_booking_test(?:_[a-z0-9_]+)?$/);
  await db.migrate.latest();
}, 30000);

beforeEach(async () => {
  await db.raw('TRUNCATE reservations, rooms, buildings, users RESTART IDENTITY');
  await db('buildings').insert({ name: 'Budynek testowy', address: 'Testowa 1' });
  await db('rooms').insert({ building_id: 1, name: 'Sala testowa', capacity: 30 });
});

afterAll(async () => {
  try { await db.destroy(); } finally { jest.restoreAllMocks(); }
});

describe('Room Booking API — PostgreSQL i Supertest', () => {
  test('rejestracja + logowanie + GET /api/auth/me, hasło zapisane jako hash', async () => {
    const { user, token } = await registerAndLogin();
    expect(user).toMatchObject({ id: 1, email: 'owner@integration.example', role: 'USER' });
    expect(user).not.toHaveProperty('passwordHash');
    const me = await request(app).get('/api/auth/me').auth(token, { type: 'bearer' }).expect(200);
    expect(me.body).toEqual(user);
    const stored = await db('users').where({ id: user.id }).first();
    expect(stored.password_hash).not.toBe(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, stored.password_hash)).toBe(true);
    expect(me.body).not.toHaveProperty('password_hash');
  });

  test('POST /api/reservations: 201, Location i rzeczywisty zapis w PostgreSQL', async () => {
    const { user, token } = await registerAndLogin();
    const response = await createReservation(token).expect(201);
    expect(response.headers.location).toBe(`/api/reservations/${response.body.id}`);
    expect(response.body).toMatchObject({
      ...booking(), status: 'CONFIRMED', user: { id: user.id, email: user.email }, createdAt: NOW,
    });
    const row = await db('reservations').where({ id: response.body.id }).first();
    expect(row).toMatchObject({ room_id: 1, user_id: user.id, participants: 10, status: 'CONFIRMED' });
    expect(row.start_time.toISOString()).toBe(booking().startTime);
    expect(row.end_time.toISOString()).toBe(booking().endTime);
  });

  test('400 z details dla błędnego body, bez zapisu rezerwacji', async () => {
    const { token } = await registerAndLogin();
    const response = await createReservation(token, booking({ participants: 0 })).expect(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([expect.objectContaining({
        location: 'body', field: 'participants', message: expect.any(String),
      })]),
    });
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    expect(await db('reservations')).toHaveLength(0);
  });

  test('401 bez tokenu', async () => {
    const response = await request(app).get('/api/reservations').expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  test('403 dla USER próbującego utworzyć salę', async () => {
    const { token } = await registerAndLogin();
    const response = await request(app).post('/api/rooms').auth(token, { type: 'bearer' })
      .send({ buildingId: 1, name: 'Niedozwolona sala', capacity: 20 }).expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await db('rooms')).toHaveLength(1);
  });

  test('404 dla USER pobierającego cudzą rezerwację', async () => {
    const owner = await registerAndLogin();
    const stranger = await registerAndLogin('stranger@integration.example');
    const created = await createReservation(owner.token).expect(201);
    const response = await request(app).get(`/api/reservations/${created.body.id}`)
      .auth(stranger.token, { type: 'bearer' }).expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body).not.toHaveProperty('user');
  });

  test('409 ROOM_ALREADY_BOOKED dla kolizji, w bazie pozostaje jeden rekord', async () => {
    const { token } = await registerAndLogin();
    await createReservation(token).expect(201);
    const response = await createReservation(token, booking({
      startTime: '2026-11-02T11:00:00.000Z', endTime: '2026-11-02T13:00:00.000Z',
    })).expect(409);
    expect(response.body.error.code).toBe('ROOM_ALREADY_BOOKED');
    expect(await db('reservations')).toHaveLength(1);
  });

  test('paginacja: limit 2 przy 3 rekordach, poprawne total i druga strona', async () => {
    const { user, token } = await registerAndLogin();
    const ids = [];
    for (const day of ['02', '03', '04']) {
      const created = await createReservation(token, booking({
        startTime: `2026-11-${day}T10:00:00.000Z`, endTime: `2026-11-${day}T12:00:00.000Z`,
      })).expect(201);
      ids.push(created.body.id);
    }
    const page = (number) => request(app).get('/api/reservations')
      .auth(token, { type: 'bearer' }).query({ page: number, limit: 2, sort: 'startTime' }).expect(200);
    const first = await page(1);
    const second = await page(2);
    expect(first.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(second.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(first.body.data).toHaveLength(2);
    expect(second.body.data).toHaveLength(1);
    expect([...first.body.data, ...second.body.data].map((item) => item.id)).toEqual(ids);
    expect(first.body.data[0].user.id).toBe(user.id);
    expect(await db('reservations')).toHaveLength(3);
  });

  test('anulowanie zapisuje CANCELLED i cancelledAt w bazie, powtórzenie jest idempotentne', async () => {
    const { token } = await registerAndLogin();
    const created = await createReservation(token).expect(201);
    const cancel = () => request(app).patch(`/api/reservations/${created.body.id}/cancel`)
      .auth(token, { type: 'bearer' }).expect(200);
    const first = await cancel();
    expect(first.body).toMatchObject({ status: 'CANCELLED', cancelledAt: NOW });
    expect((await cancel()).body).toEqual(first.body);
    const row = await db('reservations').where({ id: created.body.id }).first();
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelled_at.toISOString()).toBe(NOW);
  });

  test('równoległe próby rezerwacji: jedna 201, pozostałe 409 i jeden rekord CONFIRMED', async () => {
    const { token } = await registerAndLogin();
    const responses = await Promise.all(Array.from({ length: 5 }, () => createReservation(token)));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    const rejected = responses.filter((response) => response.status === 409);
    expect(rejected).toHaveLength(4);
    for (const response of rejected) expect(response.body.error.code).toBe('ROOM_ALREADY_BOOKED');
    expect(await db('reservations').where({ status: 'CONFIRMED' })).toHaveLength(1);
  });
});
