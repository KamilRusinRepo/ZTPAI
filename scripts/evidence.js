import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const server = createApp().listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const valid = { roomId: 1, reservedBy: 'Jan Kowalski', participants: 20, date: '2026-10-10' };
const results = [];

async function capture(title, method, path, expectedStatus, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseBody = await response.json();
  assert.equal(response.status, expectedStatus);
  results.push({ title, method, path, request: body ?? null, status: response.status,
    statusText: response.statusText, response: responseBody });
}

try {
  await capture('Zadanie 1: wszystkie sale', 'GET', '/api/rooms', 200);
  await capture('Zadanie 1: pojedyncza sala', 'GET', '/api/rooms/1', 200);
  await capture('Zadanie 1: nieistniejąca sala', 'GET', '/api/rooms/999', 404);
  await capture('Zadanie 2: utworzenie rezerwacji', 'POST', '/api/reservations', 201, valid);
  await capture('Zadanie 2: walidacja liczby uczestników', 'POST', '/api/reservations', 400, { ...valid, participants: 0 });
  await capture('Zadanie 2: rezerwacja nieistniejącej sali', 'POST', '/api/reservations', 404, { ...valid, roomId: 999 });
  await capture('Zadanie 3: przekroczenie pojemności', 'POST', '/api/reservations', 409, { ...valid, participants: 40 });
  await capture('Zadanie 3: dokładnie 30 uczestników', 'POST', '/api/reservations', 201, { ...valid, participants: 30 });
  await capture('Przygotowanie danych do filtrowania: sala 2', 'POST', '/api/reservations', 201, { ...valid, roomId: 2 });
  await capture('Zadanie 4: wszystkie rezerwacje', 'GET', '/api/reservations', 200);
  await capture('Zadanie 4: filtr roomId=1', 'GET', '/api/reservations?roomId=1', 200);
  await capture('Zadanie 4: pusty wynik', 'GET', '/api/reservations?roomId=4', 200);
  await capture('Zadanie 5: anulowanie', 'PATCH', '/api/reservations/1/cancel', 200);
  await capture('Zadanie 5: ponowne anulowanie', 'PATCH', '/api/reservations/1/cancel', 200);
  await capture('Zadanie 5: nieistniejąca rezerwacja', 'PATCH', '/api/reservations/999/cancel', 404);
  await mkdir('docs', { recursive: true });
  await writeFile('docs/evidence.json', JSON.stringify({
    capturedAt: new Date().toISOString(), node: process.version, base, results,
  }, null, 2) + '\n');
  console.log(`Zapisano ${results.length} rzeczywistych odpowiedzi HTTP w docs/evidence.json`);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
