import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { createRoomsRepository } from '../src/modules/rooms/rooms.repository.memory.js';
import { createReservationsRepository } from '../src/modules/reservations/reservations.repository.memory.js';
import { validate } from '../src/middleware/validate.js';
import { ValidationError } from '../src/errors/AppError.js';

const valid = {
  roomId: 1, reservedBy: 'Jan Kowalski', participants: 20,
  startTime: '2026-11-10T10:00:00Z', endTime: '2026-11-10T12:00:00Z',
};

async function client(t) {
  const reservationsRepository = createReservationsRepository();
  const server = createApp({ roomsRepository: createRoomsRepository(), reservationsRepository }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return {
    reservationsRepository,
    async request(path, method = 'GET', body) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, requestId: response.headers.get('X-Request-Id'), body: await response.json() };
    },
  };
}

test('Validation returns all body errors, including unknown fields, without saving', async (t) => {
  const { request, reservationsRepository } = await client(t);
  const result = await request('/api/reservations', 'POST', {
    ...valid, participants: 0, endTime: 'invalid', status: 'CANCELLED',
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  assert.equal(result.body.error.message, 'Validation failed');
  assert.ok(result.requestId);
  assert.equal(result.body.error.requestId, result.requestId);
  assert.deepEqual(result.body.error.details.map((item) => item.field).sort(), ['endTime', 'participants', 'status']);
  for (const detail of result.body.error.details) {
    assert.equal(detail.location, 'body');
    assert.equal(typeof detail.message, 'string');
  }
  assert.deepEqual(await reservationsRepository.list(), []);
});

test('Controller uses trimmed and transformed values from validation', async (t) => {
  const { request, reservationsRepository } = await client(t);
  for (const reservedBy of ['  Jan  ', 'a'.repeat(100)]) {
    const result = await request('/api/reservations', 'POST', {
      ...valid, reservedBy, startTime: '2026-11-10T10:00:00+01:00',
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.reservedBy, reservedBy.trim());
    assert.equal(result.body.startTime, '2026-11-10T09:00:00.000Z');
    const saved = await reservationsRepository.findById(result.body.id);
    assert.equal(saved.startTime, result.body.startTime);
    assert.equal(saved.reservedBy, reservedBy.trim());
  }
});

test('Invalid params and roomId queries return 400 rather than 404 or empty lists', async (t) => {
  const { request } = await client(t);
  for (const id of ['abc', '0', '-1', '1.5', '9007199254740992']) {
    for (const [path, method] of [[`/api/rooms/${id}`, 'GET'], [`/api/reservations/${id}/cancel`, 'PATCH']]) {
      const result = await request(path, method);
      assert.equal(result.status, 400);
      assert.equal(result.body.error.details[0].location, 'params');
      assert.equal(result.body.error.details[0].field, 'id');
    }
    const result = await request(`/api/reservations?roomId=${id}`);
    assert.equal(result.status, 400);
    assert.equal(result.body.error.details[0].location, 'query');
  }
  for (const query of ['roomId=', 'roomId=1&roomId=2']) {
    assert.equal((await request(`/api/reservations?${query}`)).status, 400);
  }
  assert.equal((await request('/api/rooms/999')).status, 404);
  assert.equal((await request('/api/reservations/999/cancel', 'PATCH')).status, 404);
});

test('Middleware aggregates errors across params, query and body and stops the handler', () => {
  const middleware = validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({ roomId: z.coerce.number().int().positive() }),
    body: z.object({ name: z.string().min(3) }).strict(),
  });
  const req = { params: { id: 'abc' }, query: { roomId: '0' }, body: { name: '', extra: true } };
  let calls = 0;
  middleware(req, {}, (error) => {
    calls++;
    assert.ok(error instanceof ValidationError);
    assert.deepEqual(error.details.map(({ location, field }) => [location, field]), [
      ['params', 'id'], ['query', 'roomId'], ['body', 'name'], ['body', 'extra'],
    ]);
  });
  assert.equal(calls, 1);
  assert.equal(req.validated, undefined);
});
