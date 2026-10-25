import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

const valid = { roomId: 1, reservedBy: 'Jan Kowalski', participants: 20, date: '2026-10-10' };

async function client(t) {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.match(response.headers.get('content-type'), /application\/json/);
    return { status: response.status, body: await response.json() };
  };
}

test('Zadanie 1: cztery sale i poprawne pola', async (t) => {
  const request = await client(t);
  const result = await request('/api/rooms');
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 4);
  assert.equal(new Set(result.body.map((room) => room.id)).size, 4);
  for (const room of result.body) {
    assert.equal(typeof room.name, 'string');
    assert.ok(room.capacity > 0);
    assert.deepEqual(await request(`/api/rooms/${room.id}`), { status: 200, body: room });
  }
});

test('Zadanie 1: nieistniejące ID -> 404', async (t) => {
  const request = await client(t);
  assert.equal((await request('/api/rooms/999')).status, 404);
  assert.equal((await request('/api/rooms/abc')).status, 404);
});

test('Zadanie 2: tworzenie, własne ID i status oraz kolejne ID', async (t) => {
  const request = await client(t);
  assert.deepEqual(await request('/api/reservations', 'POST', { ...valid, id: 99, status: 'CANCELLED' }), {
    status: 201, body: { id: 1, ...valid, status: 'CONFIRMED' },
  });
  assert.equal((await request('/api/reservations', 'POST', valid)).body.id, 2);
});

for (const [field, values] of Object.entries({
  roomId: [undefined, null, 0, -1, '1', 1.5],
  reservedBy: [undefined, null, '', '   ', 123],
  participants: [undefined, null, 0, -1, '20'],
  date: [undefined, null, '', '   ', 123],
})) {
  for (const value of values) {
    test(`Zadanie 2: ${field}=${JSON.stringify(value)} -> 400`, async (t) => {
      const request = await client(t);
      assert.equal((await request('/api/reservations', 'POST', { ...valid, [field]: value })).status, 400);
      assert.deepEqual((await request('/api/reservations')).body, []);
    });
  }
}

test('Zadanie 2: nieistniejąca sala -> 404', async (t) => {
  const request = await client(t);
  assert.equal((await request('/api/reservations', 'POST', { ...valid, roomId: 999 })).status, 404);
});

test('Zadanie 3: przekroczenie pojemności -> 409, granica -> 201', async (t) => {
  const request = await client(t);
  assert.deepEqual(await request('/api/reservations', 'POST', { ...valid, participants: 40 }), {
    status: 409, body: { message: 'Room capacity exceeded' },
  });
  const accepted = await request('/api/reservations', 'POST', { ...valid, participants: 30 });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.id, 1);
  assert.equal((await request('/api/reservations')).body.length, 1);
  assert.equal((await request('/api/reservations', 'POST', { ...valid, roomId: 4, participants: 11 })).status, 409);
});

test('Zadanie 4: lista, filtr i puste wyniki', async (t) => {
  const request = await client(t);
  assert.deepEqual(await request('/api/reservations'), { status: 200, body: [] });
  const first = (await request('/api/reservations', 'POST', valid)).body;
  const second = (await request('/api/reservations', 'POST', { ...valid, roomId: 2 })).body;
  assert.deepEqual((await request('/api/reservations')).body, [first, second]);
  assert.deepEqual((await request('/api/reservations?roomId=1')).body, [first]);
  assert.deepEqual((await request('/api/reservations?roomId=2')).body, [second]);
  assert.deepEqual((await request('/api/reservations?roomId=4')).body, []);
  assert.deepEqual((await request('/api/reservations?roomId=999')).body, []);
});

test('Zadanie 5: anulowanie, powtórzenie i zapis zmiany w tablicy', async (t) => {
  const request = await client(t);
  await request('/api/reservations', 'POST', valid);
  const cancelled = { id: 1, ...valid, status: 'CANCELLED' };
  assert.deepEqual(await request('/api/reservations/1/cancel', 'PATCH'), { status: 200, body: cancelled });
  assert.deepEqual((await request('/api/reservations/1/cancel', 'PATCH')).body, cancelled);
  assert.deepEqual((await request('/api/reservations')).body, [cancelled]);
  assert.equal((await request('/api/reservations/999/cancel', 'PATCH')).status, 404);
});

test('Błędny JSON i brak body -> 400; nieznana ścieżka -> 404', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const body of ['{broken', undefined, 'null', '[]']) {
    const result = await fetch(`${base}/api/reservations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    assert.equal(result.status, 400);
  }
  assert.equal((await fetch(`${base}/unknown`)).status, 404);
});
