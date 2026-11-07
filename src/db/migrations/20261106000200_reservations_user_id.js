import { randomUUID, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

export async function up(knex) {
  await knex.schema.alterTable('reservations', (table) => {
    table.integer('user_id').references('id').inTable('users').onDelete('RESTRICT');
  });

  // A historical display name does not establish ownership of a registered account.
  // Create a separate account per distinct author, with an unknown random password.
  const authors = await knex('reservations').distinct('reserved_by');
  for (const { reserved_by: name } of authors) {
    const email = `legacy-${randomUUID()}@example.invalid`;
    const password_hash = await bcrypt.hash(randomBytes(48).toString('base64'), 12);
    const [user] = await knex('users').insert({ email, password_hash, role: 'USER' }).returning('id');
    await knex('reservations').where({ reserved_by: name }).update({ user_id: user.id });
  }
  await knex.schema.alterTable('reservations', (table) => {
    table.integer('user_id').notNullable().alter();
    table.dropColumn('reserved_by');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('reservations', (table) => {
    table.string('reserved_by', 100);
  });
  // Original display names are unavailable after up; use the owner's email.
  await knex.raw(`UPDATE reservations AS r SET reserved_by = left(u.email, 100)
    FROM users AS u WHERE u.id = r.user_id`);
  await knex.schema.alterTable('reservations', (table) => {
    table.string('reserved_by', 100).notNullable().alter();
    table.dropColumn('user_id');
  });
}
