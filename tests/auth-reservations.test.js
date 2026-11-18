import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { createUsersRepository } from '../src/modules/auth/users.repository.memory.js';
import { createRoomsRepository } from '../src/modules/rooms/rooms.repository.memory.js';
import { createBuildingsRepository } from '../src/modules/buildings/buildings.repository.memory.js';
import { createReservationsRepository } from '../src/modules/reservations/reservations.repository.memory.js';
import { createReservationsService } from '../src/modules/reservations/reservations.service.js';

const input = { roomId: 1, participants: 5, startTime: '2030-11-10T10:00:00Z', endTime: '2030-11-10T11:00:00Z' };

async function client(t) {
  const jwtSecret = randomBytes(48).toString('base64');
  const usersRepository = createUsersRepository();
  const buildingsRepository = createBuildingsRepository();
  const roomsRepository = createRoomsRepository({ buildingsRepository });
  const reservationsRepository = createReservationsRepository({ roomsRepository, usersRepository });
  const server = createApp({ jwtSecret, usersRepository, buildingsRepository, roomsRepository,
    reservationsRepository, enableDebugRoutes: true, now: () => new Date('2026-11-06T12:00:00Z'),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  async function request(path, { method = 'GET', body, authorization, rawBody } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { status: response.status, body: await response.json(), requestId: response.headers.get('X-Request-Id') };
  }
  return { request, jwtSecret, usersRepository, reservationsRepository, roomsRepository };
}

test('every protected route requires authentication, including unknown routes and invalid bodies', async (t) => {
  const { request } = await client(t);
  for (const [method, path] of [
    ['GET', '/api/rooms'], ['GET', '/api/rooms/1'], ['POST', '/api/rooms'],
    ['GET', '/api/buildings'], ['POST', '/api/buildings'], ['GET', '/api/buildings/1'], ['GET', '/api/buildings/1/rooms'],
    ['GET', '/api/reservations'], ['POST', '/api/reservations'], ['GET', '/api/reservations/1'],
    ['PATCH', '/api/reservations/1/cancel'], ['GET', '/api/auth/me'], ['GET', '/api/debug/error'], ['GET', '/missing'],
  ]) {
    const result = await request(path, { method });
    assert.equal(result.status, 401, `${method} ${path}`);
    assert.equal(result.body.error.code, 'UNAUTHORIZED');
    assert.equal(result.body.error.requestId, result.requestId);
  }
  assert.equal((await request('/api/reservations', { method: 'POST', rawBody: '{broken' })).status, 401);
  assert.equal((await request('/api/auth/register', { method: 'POST', body: {} })).status, 400);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: {} })).status, 400);
  // Swagger is public; fetch the JSON document with the JSON test client.
  assert.equal((await request('/api/docs/openapi.json')).status, 200);
});

test('authenticate rejects all required invalid token cases and expired tokens have a separate message', async (t) => {
  const { request, jwtSecret } = await client(t);
  const options = { subject: '1', algorithm: 'HS256', expiresIn: '15m' };
  const token = jwt.sign({ role: 'USER' }, jwtSecret, options);
  const [header, payload, signature] = token.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), role: 'ADMIN' })).toString('base64url');
  const changedSignature = (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1);
  for (const authorization of ['Basic abc', 'Bearer', 'Bearer a b', `Bearer ${header}.${payload}.${changedSignature}`,
    `Bearer ${header}.${tamperedPayload}.${signature}`,
    `Bearer ${jwt.sign({ role: 'USER' }, jwtSecret, { ...options, algorithm: 'HS384' })}`,
    `Bearer ${jwt.sign({ role: 'USER' }, '', { ...options, algorithm: 'none' })}`]) {
    const result = await request('/api/rooms', { authorization });
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'UNAUTHORIZED');
  }
  const expired = jwt.sign({ role: 'USER' }, jwtSecret, { ...options, expiresIn: -1 });
  const result = await request('/api/rooms', { authorization: `Bearer ${expired}` });
  assert.equal(result.status, 401);
  assert.equal(result.body.error.message, 'Token expired');
});

test('register -> login -> protected endpoints; reservation user comes from token on every response', async (t) => {
  const { request, reservationsRepository } = await client(t);
  const credentials = { email: 'Jan@example.com', password: 'user-password-123' };
  const registered = await request('/api/auth/register', { method: 'POST', body: credentials });
  assert.equal(registered.status, 201);
  const login = await request('/api/auth/login', { method: 'POST', body: credentials });
  assert.equal(login.status, 200);
  const authorization = `Bearer ${login.body.accessToken}`;
  for (const path of ['/api/rooms', '/api/buildings', '/api/buildings/1/rooms', '/api/auth/me']) {
    assert.equal((await request(path, { authorization })).status, 200);
  }
  for (const extra of [{ userId: 999 }, { userId: registered.body.id }, { reservedBy: 'Other person' }]) {
    const rejected = await request('/api/reservations', { method: 'POST', authorization, body: { ...input, ...extra } });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.details[0].field, Object.keys(extra)[0]);
  }
  assert.deepEqual(await reservationsRepository.list(), []);
  const created = await request('/api/reservations', { method: 'POST', authorization, body: input });
  assert.equal(created.status, 201);
  const expectedUser = { id: registered.body.id, email: registered.body.email };
  const detail = await request(`/api/reservations/${created.body.id}`, { authorization });
  const list = await request('/api/reservations?page=1&limit=1', { authorization });
  const cancelled = await request(`/api/reservations/${created.body.id}/cancel`, { method: 'PATCH', authorization });
  for (const response of [created.body, detail.body, list.body.data[0], cancelled.body]) {
    assert.deepEqual(response.user, expectedUser);
    assert.doesNotMatch(JSON.stringify(response), /reservedBy|reserved_by|passwordHash|password_hash/);
    assert.equal('userId' in response, false);
  }
  assert.equal((await reservationsRepository.findById(created.body.id)).userId, expectedUser.id);
  const repeated = await request(`/api/reservations/${created.body.id}/cancel`, { method: 'PATCH', authorization });
  assert.deepEqual(repeated.body, cancelled.body);
});

test('service requires the caller and ignores a forged userId in input', async (t) => {
  const { usersRepository, roomsRepository, reservationsRepository } = await client(t);
  const user = await usersRepository.create({ email: 'test@example.com', passwordHash: 'fixture', role: 'USER' });
  const service = createReservationsService({ roomsRepository, reservationsRepository, now: () => new Date('2026-11-06T12:00:00Z') });
  await assert.rejects(service.createReservation(input), { statusCode: 401 });
  const created = await service.createReservation({ ...input, userId: 999 }, { id: user.id, role: user.role });
  assert.equal(created.userId, user.id);
  assert.deepEqual(created.user, { id: user.id, email: user.email });
});
