import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomsRepository } from '../src/modules/rooms/rooms.repository.memory.js';
import { createReservationsRepository } from '../src/modules/reservations/reservations.repository.memory.js';
import { createReservationsService } from '../src/modules/reservations/reservations.service.js';

const input = {
  roomId: 1, reservedBy: 'Jan Kowalski', participants: 20,
  startTime: '2026-11-10T10:00:00.000Z', endTime: '2026-11-10T12:00:00.000Z',
};

test('Repositories keep independent state and return copies through Promises', async () => {
  const first = createReservationsRepository();
  const second = createReservationsRepository();
  assert.ok(first.list() instanceof Promise);
  assert.ok(first.findById(999) instanceof Promise);
  assert.equal(await first.findById(999), null);
  const created = await first.create({ ...input, status: 'CONFIRMED' });
  created.status = 'CANCELLED';
  assert.equal((await first.findById(created.id)).status, 'CONFIRMED');
  assert.deepEqual(await second.list(), []);
  const updated = await first.updateStatus(created.id, 'CANCELLED', '2026-10-25T10:00:00.000Z');
  assert.equal(updated.status, 'CANCELLED');
  assert.equal((await first.create(input)).id, 2);
  const rooms = createRoomsRepository();
  assert.ok(rooms.list() instanceof Promise);
  const room = await rooms.findById(1);
  room.capacity = 0;
  assert.equal((await rooms.findById(1)).capacity, 30);
});

test('Service uses injected repositories without HTTP and saves only accepted reservations', async () => {
  let saves = 0;
  const service = createReservationsService({
    roomsRepository: { async findById(id) { return id === 1 ? { id, capacity: 30 } : null; } },
    reservationsRepository: { async create(data) { saves++; return { ...data, id: saves }; } },
    now: () => new Date('2026-10-25T10:00:00.000Z'),
  });
  await assert.rejects(service.createReservation({ ...input, roomId: 999 }), { message: 'Room not found' });
  await assert.rejects(service.createReservation({ ...input, participants: 31 }), { message: 'Room capacity exceeded' });
  assert.equal(saves, 0);
  const reservation = await service.createReservation(input);
  assert.equal(reservation.id, 1);
  assert.equal(reservation.createdAt, '2026-10-25T10:00:00.000Z');
  assert.equal(reservation.cancelledAt, null);
  assert.equal(reservation.status, 'CONFIRMED');
});
