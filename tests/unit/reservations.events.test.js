import { describe, expect, jest, test } from '@jest/globals';
import { createReservationsService } from '../../src/modules/reservations/reservations.service.js';
import { createRoomsRepository } from '../../src/modules/rooms/rooms.repository.memory.js';
import { createReservationsRepository } from '../../src/modules/reservations/reservations.repository.memory.js';

const OWNER = { id: 1, role: 'USER' };
const ADMIN = { id: 99, role: 'ADMIN' };
const INPUT = { roomId: 1, participants: 10,
  startTime: '2026-11-02T10:00:00.000Z', endTime: '2026-11-02T11:00:00.000Z' };

function setup(transaction) {
  const repositories = { roomsRepository: createRoomsRepository(), reservationsRepository: createReservationsRepository() };
  const eventBus = { publish: jest.fn() };
  const service = createReservationsService({ ...repositories, eventBus,
    now: () => new Date('2026-11-01T09:00:00Z'),
    ...(transaction ? { runInTransaction: (operation) => transaction(operation, repositories) } : {}),
  });
  return { service, eventBus, ...repositories };
}

describe('Zdarzenia serwisu rezerwacji', () => {
  test('publikuje reservation.created po sukcesie z wymaganym payloadem', async () => {
    const { service, eventBus } = setup();
    const created = await service.createReservation(INPUT, OWNER);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith('reservation.created', {
      reservationId: created.id, roomId: INPUT.roomId, userId: OWNER.id,
      startTime: INPUT.startTime, endTime: INPUT.endTime,
    });
  });

  test('409 nie publikuje zdarzenia', async () => {
    const { service, eventBus } = setup();
    await service.createReservation(INPUT, OWNER);
    eventBus.publish.mockClear();
    await expect(service.createReservation(INPUT, OWNER)).rejects.toMatchObject({ code: 'ROOM_ALREADY_BOOKED' });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  test('publish jest po zatwierdzeniu transakcji, zarówno przy create, jak i cancel', async () => {
    let committed = false;
    const { service, eventBus } = setup(async (operation, repositories) => {
      committed = false;
      const result = await operation(repositories);
      expect(eventBus.publish).not.toHaveBeenCalled();
      committed = true;
      return result;
    });
    eventBus.publish.mockImplementation(() => { expect(committed).toBe(true); });
    const created = await service.createReservation(INPUT, OWNER);
    eventBus.publish.mockClear();
    await service.cancelReservation(created.id, ADMIN);
    expect(eventBus.publish).toHaveBeenCalledWith('reservation.cancelled', {
      reservationId: created.id, roomId: 1, userId: OWNER.id, cancelledBy: ADMIN.id,
    });
  });

  test('błąd COMMIT po wykonaniu operacji nie publikuje zdarzenia', async () => {
    const { service, eventBus } = setup(async (operation, repositories) => {
      await operation(repositories);
      throw new Error('commit failed');
    });
    await expect(service.createReservation(INPUT, OWNER)).rejects.toThrow('commit failed');
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  test('błąd COMMIT anulowania nie publikuje zdarzenia', async () => {
    let fail = false;
    const { service, eventBus } = setup(async (operation, repositories) => {
      const result = await operation(repositories);
      if (fail) throw new Error('commit failed');
      return result;
    });
    const created = await service.createReservation(INPUT, OWNER);
    eventBus.publish.mockClear();
    fail = true;
    await expect(service.cancelReservation(created.id, OWNER)).rejects.toThrow('commit failed');
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  test('ponowne i równoległe anulowanie publikuje tylko jedno reservation.cancelled', async () => {
    const { service, eventBus } = setup();
    const created = await service.createReservation(INPUT, OWNER);
    eventBus.publish.mockClear();
    const cancelled = await Promise.all([
      service.cancelReservation(created.id, ADMIN), service.cancelReservation(created.id, ADMIN),
    ]);
    expect(cancelled[0]).toEqual(cancelled[1]);
    await service.cancelReservation(created.id, ADMIN);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith('reservation.cancelled', {
      reservationId: created.id, roomId: 1, userId: OWNER.id, cancelledBy: ADMIN.id,
    });
  });

  test('odmowa dostępu nie publikuje zdarzenia', async () => {
    const { service, eventBus } = setup();
    const created = await service.createReservation(INPUT, OWNER);
    eventBus.publish.mockClear();
    await expect(service.cancelReservation(created.id, { id: 2, role: 'USER' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
