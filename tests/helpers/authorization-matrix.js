import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';

export async function seedAuthorizationFixture({ usersRepository, reservationsRepository }) {
  const password = 'authorization-password-123';
  const passwordHash = await bcrypt.hash(password, 10);
  const users = {};
  for (const [name, role] of [['owner', 'USER'], ['stranger', 'USER'], ['admin', 'ADMIN']]) {
    users[name] = await usersRepository.create({ email: `${name}@authorization.example.invalid`, passwordHash, role });
  }
  const reservation = (userId, startTime, endTime, status = 'CONFIRMED') => reservationsRepository.create({
    roomId: 1, userId, participants: 5, startTime, endTime, status,
    createdAt: '2026-01-01T00:00:00Z', cancelledAt: status === 'CANCELLED' ? '2026-02-01T00:00:00Z' : null,
  });
  const own = await reservation(users.owner.id, '2030-01-01T10:00:00Z', '2030-01-01T11:00:00Z');
  await reservation(users.stranger.id, '2030-01-02T10:00:00Z', '2030-01-02T11:00:00Z');
  const started = await reservation(users.owner.id, '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
  const cancelled = await reservation(users.owner.id, '2030-01-03T10:00:00Z', '2030-01-03T11:00:00Z', 'CANCELLED');
  return { users, password, variables: { ownerId: users.owner.id, ownerReservationId: own.id,
    startedReservationId: started.id, cancelledReservationId: cancelled.id } };
}

export async function loginAuthorizationActors(baseUrl, fixture) {
  const actors = [{ name: 'anonymous' }];
  for (const name of ['owner', 'stranger', 'admin']) {
    const user = fixture.users[name];
    const response = await fetch(baseUrl + '/api/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: fixture.password }) });
    assert.equal(response.status, 200);
    actors.push({ name, id: user.id, token: (await response.json()).accessToken });
  }
  return actors;
}

export async function runAuthorizationMatrix({ baseUrl, fixture, actors, record = () => {} }) {
  const source = readFileSync(new URL('../../docs/authorization.http', import.meta.url), 'utf8');
  const variables = { ...fixture.variables, baseUrl };
  const matrix = [];
  for (const block of source.split(/^### /m).slice(1)) {
    const lines = block.trim().split(/\r?\n/);
    const label = lines[0];
    const expected = /# expect: ([\d ]+)/.exec(block)[1].trim().split(/\s+/).map(Number);
    const requestIndex = lines.findIndex((line, index) => index > 0 && /^(GET|POST|PATCH|DELETE) /.test(line));
    const [method, urlTemplate] = lines[requestIndex].split(' ');
    const bodyIndex = lines.findIndex((line, index) => index > requestIndex && line === '');
    const bodyTemplate = bodyIndex < 0 ? undefined : lines.slice(bodyIndex + 1).join('\n');
    const check = /# check: (\w+)/.exec(block)?.[1];
    const capture = /# capture: (\w+)/.exec(block)?.[1];
    const statuses = [];
    for (const [index, actor] of actors.entries()) {
      const context = { ...variables, roleHour: String(8 + index * 2).padStart(2, '0'),
        roleEndHour: String(9 + index * 2).padStart(2, '0') };
      const expand = (text) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        assert.notEqual(context[key], undefined, `Missing variable ${key}`);
        return String(context[key]);
      });
      const url = expand(urlTemplate);
      const body = bodyTemplate ? expand(bodyTemplate) : undefined;
      const response = await fetch(url, { method,
        headers: { ...(actor.token ? { Authorization: `Bearer ${actor.token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}) }, body });
      const data = response.status === 204 ? null : await response.json();
      record({ source: 'docs/authorization.http', label, actor: actor.name, method,
        path: url.slice(baseUrl.length), requestBody: body ? JSON.parse(body) : undefined, status: response.status, response: data });
      assert.equal(response.status, expected[index], `${label}: ${actor.name}`);
      statuses.push(response.status);
      if (response.status === 404) {
        assert.equal(data.error.code, 'NOT_FOUND');
        assert.equal(data.error.message, 'Reservation not found');
      }
      if (response.status === 403) assert.equal(data.error.code, 'FORBIDDEN');
      if (response.status < 300 && capture && actor.name === 'admin') variables[capture] = data.id;
      if (response.status === 200 && ['list', 'page', 'combined', 'adminFilter'].includes(check)) {
        const expectedCount = check === 'combined' ? (actor.name === 'admin' ? 2 : 1)
          : check === 'adminFilter' ? 3 : actor.name === 'admin' ? 4 : actor.name === 'owner' ? 3 : 1;
        assert.equal(data.meta.total, expectedCount);
        assert.equal(data.meta.totalPages, Math.ceil(expectedCount / data.meta.limit));
        for (const item of data.data) {
          if (actor.name !== 'admin') assert.equal(item.user.id, actor.id);
          if (check === 'adminFilter') assert.equal(item.user.id, fixture.users.owner.id);
        }
        if (check === 'page') assert.equal(data.data.length, actor.name === 'stranger' ? 0 : 1);
      }
      if (check === 'createReservation' && response.status === 201) assert.equal(data.user.id, actor.id);
      if (response.status === 409 && label.startsWith('POST overlapping')) assert.equal(data.error.code, 'ROOM_ALREADY_BOOKED');
      if (response.status === 409 && label.startsWith('POST above')) assert.equal(data.error.code, 'ROOM_CAPACITY_EXCEEDED');
      if (response.status === 409 && label.startsWith('PATCH started')) assert.equal(data.error.code, 'RESERVATION_ALREADY_STARTED');
    }
    matrix.push({ label, statuses });
  }
  return matrix;
}
