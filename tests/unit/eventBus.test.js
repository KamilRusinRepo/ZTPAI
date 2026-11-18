import { describe, expect, jest, test } from '@jest/globals';
import { createEventBus } from '../../src/events/eventBus.js';
import { registerNotificationListeners } from '../../src/events/notificationListeners.js';

describe('EventEmitter z izolacją listenerów', () => {
  test.each([
    ['synchroniczny throw', () => { throw new Error('listener failed'); }],
    ['odrzucony Promise', async () => { throw new Error('listener failed'); }],
  ])('%s nie przerywa publikacji ani drugiego listenera', async (_name, failingListener) => {
    const logger = { error: jest.fn() };
    const bus = createEventBus({ logger, now: () => new Date('2026-11-18T10:00:00Z') });
    const healthy = jest.fn();
    bus.subscribe('reservation.created', failingListener);
    bus.subscribe('reservation.created', healthy);
    expect(() => bus.publish('reservation.created', { reservationId: 1 })).not.toThrow();
    expect(healthy).not.toHaveBeenCalled();
    await bus.flush();
    expect(healthy).toHaveBeenCalledWith({ name: 'reservation.created', occurredAt: '2026-11-18T10:00:00.000Z', payload: { reservationId: 1 } });
    expect(logger.error).toHaveBeenCalledWith('[event:reservation.created] handler failed', expect.any(Error));
  });

  test('flush czeka także na zdarzenia opublikowane przez listener i umożliwia unsubscribe', async () => {
    const bus = createEventBus();
    const listener = jest.fn();
    bus.subscribe('first', () => bus.publish('second', {}));
    const unsubscribe = bus.subscribe('second', listener);
    bus.publish('first', {});
    await bus.flush();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    bus.publish('first', {});
    await bus.flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('Powiadomienie właściciela', () => {
  test.each([
    ['ADMIN anuluje cudzą', 99, 'ADMIN', true],
    ['właściciel anuluje własną', 1, 'USER', false],
    ['ADMIN anuluje własną', 1, 'ADMIN', false],
    ['inny USER', 2, 'USER', false],
  ])('%s', async (_label, cancelledBy, role, expected) => {
    const logger = { log: jest.fn() };
    const bus = createEventBus();
    const users = { async findById(id) {
      return { id, role: id === cancelledBy ? role : 'USER', email: id === 1 ? 'owner@example.com' : 'actor@example.com' };
    } };
    registerNotificationListeners(bus, users, { logger });
    bus.publish('reservation.cancelled', { reservationId: 10, roomId: 1, userId: 1, cancelledBy });
    await bus.flush();
    expect(logger.log).toHaveBeenCalledTimes(expected ? 1 : 0);
    if (expected) expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('[notification] to: owner@example.com'));
  });
});
