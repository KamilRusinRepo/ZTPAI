import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { authorize } from '../src/middleware/authorize.js';
import { createReservationsService } from '../src/modules/reservations/reservations.service.js';
import { createUsersRepository } from '../src/modules/auth/users.repository.memory.js';
import { createRoomsRepository } from '../src/modules/rooms/rooms.repository.memory.js';
import { createBuildingsRepository } from '../src/modules/buildings/buildings.repository.memory.js';
import { createReservationsRepository } from '../src/modules/reservations/reservations.repository.memory.js';
import { seedAuthorizationFixture, loginAuthorizationActors, runAuthorizationMatrix } from './helpers/authorization-matrix.js';

test('HTTP authorization matrix: every request in authorization.http under four identities', async (t) => {
  const usersRepository = createUsersRepository();
  const buildingsRepository = createBuildingsRepository();
  const roomsRepository = createRoomsRepository({ buildingsRepository });
  const reservationsRepository = createReservationsRepository({ roomsRepository, usersRepository });
  const fixture = await seedAuthorizationFixture({ usersRepository, reservationsRepository });
  const server = createApp({ jwtSecret: randomBytes(48).toString('base64'), usersRepository,
    buildingsRepository, roomsRepository, reservationsRepository, now: () => new Date('2026-11-06T12:00:00Z'),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const actors = await loginAuthorizationActors(baseUrl, fixture);
  const matrix = await runAuthorizationMatrix({ baseUrl, actors, fixture });
  assert.equal(matrix.length, 26);
  const admin = actors.find((actor) => actor.name === 'admin');
  for (const body of [{}, { role: 'ADMIN' }, { capacity: 0 }]) {
    const response = await fetch(baseUrl + '/api/rooms/1', { method: 'PATCH',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
});

test('authorize requires authentication and permits only listed roles', () => {
  const middleware = authorize('ADMIN');
  for (const [user, status] of [[undefined, 401], [{ id: 1, role: 'USER' }, 403], [{ id: 2, role: 'ADMIN' }, undefined]]) {
    let calls = 0;
    middleware({ user }, {}, (error) => { calls++; assert.equal(error?.statusCode, status); });
    assert.equal(calls, 1);
  }
});

test('service enforces list ownership before pagination and rejects userId for USER', async () => {
  const calls = [];
  const service = createReservationsService({ reservationsRepository: {
    async listPage(filters) { calls.push(filters); return { items: [], total: 0 }; },
  } });
  const owner = { id: 7, role: 'USER' };
  const admin = { id: 9, role: 'ADMIN' };
  const filters = { roomId: 2, buildingId: 1, page: 3, limit: 1, sort: '-startTime', status: 'CONFIRMED' };
  await service.listReservations(filters, owner);
  assert.deepEqual(calls[0], { ...filters, userId: 7 });
  assert.equal('userId' in filters, false);
  await assert.rejects(service.listReservations({ ...filters, userId: 7 }, owner), { statusCode: 403 });
  await assert.rejects(service.listReservations({ ...filters, userId: 99 }, owner), { statusCode: 403 });
  assert.equal(calls.length, 1);
  await service.listReservations(filters, admin);
  await service.listReservations({ ...filters, userId: 7 }, admin);
  assert.deepEqual(calls[1], filters);
  assert.deepEqual(calls[2], { ...filters, userId: 7 });
});

test('service hides foreign reservations before business rules and rechecks after acquiring the room lock', async () => {
  const owner = { id: 1, role: 'USER' };
  const stranger = { id: 2, role: 'USER' };
  const reservation = { id: 1, userId: 1, roomId: 1, status: 'CANCELLED' };
  let reads = 0;
  let updates = 0;
  const service = createReservationsService({ roomsRepository: { async lockById() {} },
    reservationsRepository: {
      async findById(id) { reads++; return id === 1 ? reservation : null; },
      async updateStatus() { updates++; },
    },
  });
  await assert.rejects(service.getReservation(1, stranger), { statusCode: 404, message: 'Reservation not found' });
  await assert.rejects(service.getReservation(99, stranger), { statusCode: 404, message: 'Reservation not found' });
  await assert.rejects(service.cancelReservation(1, stranger), { statusCode: 404 });
  assert.equal(updates, 0);
  assert.deepEqual(await service.getReservation(1, owner), reservation);
  reads = 0;
  const raced = createReservationsService({ roomsRepository: { async lockById() {} }, reservationsRepository: {
    async findById() { return { ...reservation, userId: ++reads === 1 ? 1 : 2 }; },
    async updateStatus() { throw new Error('must not update'); },
  } });
  await assert.rejects(raced.cancelReservation(1, owner), { statusCode: 404 });
  assert.equal(reads, 2);
  await assert.rejects(service.getReservation(1), { statusCode: 401 });
  await assert.rejects(service.cancelReservation(1), { statusCode: 401 });
  await assert.rejects(service.listReservations({}), { statusCode: 401 });
});
