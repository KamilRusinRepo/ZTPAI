// Wyłącznie lokalna baza demonstracyjna: seed zastępuje wszystkie dane.
export async function seed(knex) {
  await knex.transaction(async (trx) => {
    await trx.raw('TRUNCATE reservations, rooms, buildings RESTART IDENTITY');
    await trx('buildings').insert([
      { name: 'Budynek A', address: 'ul. Warszawska 24, Kraków' },
      { name: 'Budynek B', address: 'ul. Warszawska 25, Kraków' },
    ]);
    await trx('rooms').insert([
      { building_id: 1, name: '101', capacity: 30 },
      { building_id: 1, name: '102', capacity: 20 },
      { building_id: 2, name: '101', capacity: 50 },
      { building_id: 2, name: '202', capacity: 10 },
      { building_id: 2, name: '203', capacity: 40 },
    ]);
    const created_at = '2020-01-01T08:00:00.000Z';
    await trx('buildings').update({ created_at });
    await trx('rooms').update({ created_at });
    await trx('reservations').insert([
      { room_id: 1, reserved_by: 'Jan Kowalski', participants: 10,
        start_time: '2026-11-02T10:00:00Z', end_time: '2026-11-02T23:00:00Z',
        status: 'CONFIRMED', created_at, cancelled_at: null },
      { room_id: 2, reserved_by: 'Anna Nowak', participants: 5,
        start_time: '2030-11-10T10:00:00Z', end_time: '2030-11-10T12:00:00Z',
        status: 'CANCELLED', created_at, cancelled_at: '2020-01-01T09:00:00Z' },
      { room_id: 3, reserved_by: 'Piotr Wiśniewski', participants: 20,
        start_time: '2030-11-10T10:00:00Z', end_time: '2030-11-10T12:00:00Z',
        status: 'CONFIRMED', created_at, cancelled_at: null },
      { room_id: 4, reserved_by: 'Maria Wójcik', participants: 8,
        start_time: '2030-11-11T10:00:00Z', end_time: '2030-11-11T11:00:00Z',
        status: 'CONFIRMED', created_at, cancelled_at: null },
      { room_id: 5, reserved_by: 'Adam Kowalski', participants: 15,
        start_time: '2030-11-12T10:00:00Z', end_time: '2030-11-12T12:00:00Z',
        status: 'CONFIRMED', created_at, cancelled_at: null },
    ]);
  });
}
