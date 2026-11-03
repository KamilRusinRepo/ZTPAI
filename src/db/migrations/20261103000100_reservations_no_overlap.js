export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');
  await knex.raw(`
    ALTER TABLE reservations
    ADD CONSTRAINT reservations_no_overlap
    EXCLUDE USING gist (
      room_id WITH =,
      tstzrange(start_time, end_time, '[)') WITH &&
    ) WHERE (status = 'CONFIRMED')
  `);
}

export async function down(knex) {
  await knex.raw('ALTER TABLE reservations DROP CONSTRAINT reservations_no_overlap');
  // Nie usuwamy rozszerzenia, które może być współdzielone przez inne tabele.
}
