import { describe, expect, test } from '@jest/globals';
import { createReservationsService } from '../../src/modules/reservations/reservations.service.js';
import { createRoomsRepository } from '../../src/modules/rooms/rooms.repository.memory.js';
import { createReservationsRepository } from '../../src/modules/reservations/reservations.repository.memory.js';

const OWNER = { id: 1, role: 'USER' };
const OTHER_USER = { id: 2, role: 'USER' };
const ADMIN = { id: 99, role: 'ADMIN' };
const NOW = '2026-11-01T09:00:00.000Z';
const at = (time) => `2026-11-02T${time}:00.000Z`;
const booking = (changes = {}) => ({
  roomId: 1,
  participants: 20,
  startTime: at('10:00'),
  endTime: at('12:00'),
  ...changes,
});

// Każde wywołanie tworzy własny stan i zegar, bez importowania aplikacji lub bazy.
function setup() {
  let currentTime = NOW;
  const roomsRepository = createRoomsRepository();
  const reservationsRepository = createReservationsRepository({ roomsRepository });
  const service = createReservationsService({
    roomsRepository,
    reservationsRepository,
    now: () => new Date(currentTime),
  });
  return { service, roomsRepository, reservationsRepository, setNow: (time) => { currentTime = time; } };
}

describe('reservationsService.createReservation', () => {
  test('zapisuje CONFIRMED, autora i wstrzyknięty czas', async () => {
    const { service, reservationsRepository } = setup();
    const created = await service.createReservation(booking(), OWNER);
    expect(created).toMatchObject({
      ...booking(), id: 1, userId: OWNER.id, status: 'CONFIRMED', createdAt: NOW, cancelledAt: null,
    });
    expect(await reservationsRepository.findById(created.id)).toEqual(created);
  });

  test.each([
    ['częściowe z lewej', '09:00', '11:00'],
    ['częściowe z prawej', '11:00', '13:00'],
  ])('odrzuca nakładanie częściowe: %s', async (_name, start, end) => {
    const { service, reservationsRepository } = setup();
    const existing = await service.createReservation(booking(), OWNER);
    await expect(service.createReservation(booking({ startTime: at(start), endTime: at(end) }), OWNER))
      .rejects.toMatchObject({ statusCode: 409, code: 'ROOM_ALREADY_BOOKED' });
    expect(await reservationsRepository.list()).toEqual([existing]);
  });

  test.each([
    ['nowy zawiera istniejący', '09:00', '13:00'],
    ['nowy zawarty w istniejącym', '10:30', '11:00'],
  ])('odrzuca zawieranie przedziałów: %s', async (_name, start, end) => {
    const { service, reservationsRepository } = setup();
    const existing = await service.createReservation(booking(), OWNER);
    await expect(service.createReservation(booking({ startTime: at(start), endTime: at(end) }), OWNER))
      .rejects.toMatchObject({ statusCode: 409, code: 'ROOM_ALREADY_BOOKED' });
    expect(await reservationsRepository.list()).toEqual([existing]);
  });

  test('odrzuca identyczne przedziały w tej samej sali', async () => {
    const { service, reservationsRepository } = setup();
    const existing = await service.createReservation(booking(), OWNER);
    await expect(service.createReservation(booking(), OWNER))
      .rejects.toMatchObject({ statusCode: 409, code: 'ROOM_ALREADY_BOOKED' });
    expect(await reservationsRepository.list()).toEqual([existing]);
  });

  test.each([
    ['koniec nowej = początek istniejącej', '09:00', '10:00'],
    ['początek nowej = koniec istniejącej', '12:00', '13:00'],
  ])('dopuszcza stykające się przedziały: %s', async (_name, start, end) => {
    const { service, reservationsRepository } = setup();
    await service.createReservation(booking(), OWNER);
    await expect(service.createReservation(booking({ startTime: at(start), endTime: at(end) }), OWNER))
      .resolves.toMatchObject({ id: 2, status: 'CONFIRMED' });
    expect(await reservationsRepository.list()).toHaveLength(2);
  });

  test('dopuszcza ten sam przedział w innej sali', async () => {
    const { service, reservationsRepository } = setup();
    await service.createReservation(booking(), OWNER);
    await expect(service.createReservation(booking({ roomId: 2 }), OWNER))
      .resolves.toMatchObject({ roomId: 2, status: 'CONFIRMED' });
    expect(await reservationsRepository.list()).toHaveLength(2);
  });

  test('CANCELLED nie blokuje ponownej rezerwacji przedziału', async () => {
    const { service, reservationsRepository } = setup();
    const first = await service.createReservation(booking(), OWNER);
    await service.cancelReservation(first.id, OWNER);
    await expect(service.createReservation(booking(), OWNER))
      .resolves.toMatchObject({ id: 2, status: 'CONFIRMED' });
    expect(await reservationsRepository.findById(first.id)).toMatchObject({ status: 'CANCELLED' });
  });

  test('dopuszcza participants == capacity', async () => {
    const { service, roomsRepository } = setup();
    const { capacity } = await roomsRepository.findById(1);
    await expect(service.createReservation(booking({ participants: capacity }), OWNER))
      .resolves.toMatchObject({ participants: capacity, status: 'CONFIRMED' });
  });

  test('odrzuca participants == capacity + 1 bez zapisu', async () => {
    const { service, roomsRepository, reservationsRepository } = setup();
    const { capacity } = await roomsRepository.findById(1);
    await expect(service.createReservation(booking({ participants: capacity + 1 }), OWNER))
      .rejects.toMatchObject({ statusCode: 409, code: 'ROOM_CAPACITY_EXCEEDED' });
    expect(await reservationsRepository.list()).toEqual([]);
  });

  test.each([
    ['dokładnie 15 minut', '10:15'],
    ['dokładnie 8 godzin', '18:00'],
  ])('dopuszcza czas trwania: %s', async (_name, end) => {
    const { service } = setup();
    await expect(service.createReservation(booking({ endTime: at(end) }), OWNER))
      .resolves.toMatchObject({ endTime: at(end), status: 'CONFIRMED' });
  });

  test.each([
    ['14 minut', '10:14'],
    ['8 godzin i 1 minuta', '18:01'],
    ['zerowy czas', '10:00'],
    ['koniec przed początkiem', '09:00'],
  ])('odrzuca czas trwania: %s', async (_name, end) => {
    const { service, reservationsRepository } = setup();
    await expect(service.createReservation(booking({ endTime: at(end) }), OWNER))
      .rejects.toMatchObject({
        statusCode: 400, code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([expect.objectContaining({ field: 'endTime' })]),
      });
    expect(await reservationsRepository.list()).toEqual([]);
  });

  test('odrzuca początek w przeszłości względem wstrzykniętego czasu', async () => {
    const { service, reservationsRepository, setNow } = setup();
    setNow(at('10:01'));
    await expect(service.createReservation(booking(), OWNER))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(await reservationsRepository.list()).toEqual([]);
  });
});

describe('reservationsService.cancelReservation', () => {
  test.each([
    ['dokładnie w chwili rozpoczęcia', '10:00'],
    ['po rozpoczęciu', '10:01'],
  ])('odrzuca anulowanie: %s', async (_name, time) => {
    const { service, reservationsRepository, setNow } = setup();
    const created = await service.createReservation(booking(), OWNER);
    setNow(at(time));
    await expect(service.cancelReservation(created.id, OWNER))
      .rejects.toMatchObject({ statusCode: 409, code: 'RESERVATION_ALREADY_STARTED' });
    expect(await reservationsRepository.findById(created.id)).toEqual(created);
  });

  test('właściciel anuluje przyszłą rezerwację z czasem cancelledAt', async () => {
    const { service, reservationsRepository } = setup();
    const created = await service.createReservation(booking(), OWNER);
    const cancelled = await service.cancelReservation(created.id, OWNER);
    expect(cancelled).toMatchObject({ id: created.id, status: 'CANCELLED', cancelledAt: NOW });
    expect(await reservationsRepository.findById(created.id)).toEqual(cancelled);
  });

  test('podwójne anulowanie zachowuje cancelledAt mimo zmiany czasu', async () => {
    const { service, reservationsRepository, setNow } = setup();
    const created = await service.createReservation(booking(), OWNER);
    const first = await service.cancelReservation(created.id, OWNER);
    setNow(at('11:00'));
    const second = await service.cancelReservation(created.id, OWNER);
    expect(second).toEqual(first);
    expect(second.cancelledAt).toBe(NOW);
    expect(await reservationsRepository.findById(created.id)).toEqual(first);
  });

  test('odrzuca anulowanie cudzej rezerwacji przez USER', async () => {
    const { service, reservationsRepository } = setup();
    const created = await service.createReservation(booking(), OWNER);
    await expect(service.cancelReservation(created.id, OTHER_USER))
      .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(await reservationsRepository.findById(created.id)).toEqual(created);
  });

  test('ADMIN może anulować cudzą rezerwację', async () => {
    const { service, reservationsRepository } = setup();
    const created = await service.createReservation(booking(), OWNER);
    const cancelled = await service.cancelReservation(created.id, ADMIN);
    expect(cancelled).toMatchObject({ userId: OWNER.id, status: 'CANCELLED', cancelledAt: NOW });
    expect(await reservationsRepository.findById(created.id)).toEqual(cancelled);
  });
});

describe('reservationsService.getReservation', () => {
  test('USER nie może odczytać cudzej rezerwacji', async () => {
    const { service } = setup();
    const created = await service.createReservation(booking(), OWNER);
    await expect(service.getReservation(created.id, OTHER_USER))
      .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  test('ADMIN może odczytać cudzą rezerwację', async () => {
    const { service } = setup();
    const created = await service.createReservation(booking(), OWNER);
    await expect(service.getReservation(created.id, ADMIN)).resolves.toEqual(created);
  });
});
