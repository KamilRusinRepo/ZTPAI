import knex from 'knex';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import config from '../knexfile.js';
import { createReservationBody } from '../src/modules/reservations/reservations.schemas.js';

export async function countConfirmed(db, input) {
  const query = db('reservations').where({ room_id: input.roomId, status: 'CONFIRMED' })
    .where('start_time', '<', input.endTime).where('end_time', '>', input.startTime)
    .count({ count: '*' }).first();
  const row = await query;
  return { count: Number(row.count), sql: query.toSQL() };
}

export async function runDoubleBooking({ db, input, accessToken, baseUrls = ['http://localhost:3000'], log = console.log }) {
  if (!accessToken) throw new Error('Pass an accessToken obtained from POST /api/auth/login');
  log('Reservation: ' + JSON.stringify(input));
  const responses = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
    const base = baseUrls[index % baseUrls.length].replace(/\/$/, '');
    const response = await fetch(`${base}/api/reservations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(input), signal: AbortSignal.timeout(20000),
    });
    return { status: response.status, body: await response.json() };
  }));
  responses.forEach((response, index) => log(`Request ${index + 1}: ${response.status}${response.body.error ? ' ' + response.body.error.code : ''}`));
  const { count, sql } = await countConfirmed(db, input);
  log('SQL: ' + sql.sql + ' | bindings: ' + JSON.stringify(sql.bindings));
  log(`CONFIRMED reservations overlapping this interval: ${count}`);
  return { responses, count };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(10, 0, 0, 0);
  const startTime = process.argv[3] ?? tomorrow.toISOString();
  const input = createReservationBody.parse({
    roomId: Number(process.argv[2] ?? 1), participants: 1,
    startTime, endTime: process.argv[4] ?? new Date(new Date(startTime).getTime() + 3600000).toISOString(),
  });
  const db = knex(config);
  try {
    if ((await countConfirmed(db, input)).count !== 0) {
      throw new Error('This interval is already booked. Choose another room or start/end time; no requests were sent.');
    }
    const { responses, count } = await runDoubleBooking({ db, input,
      accessToken: process.env.ACCESS_TOKEN,
      baseUrls: [process.env.BASE_URL ?? 'http://localhost:3000'] });
    const expected = responses.filter((response) => response.status === 201).length === 1
      && responses.filter((response) => response.status === 409 && response.body.error.code === 'ROOM_ALREADY_BOOKED').length === 9
      && count === 1;
    if (!expected) process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}
