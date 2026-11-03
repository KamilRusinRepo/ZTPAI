export async function up(knex) {
  await knex.schema.createTable('buildings', (table) => {
    table.increments('id').primary();
    table.string('name', 120).notNullable();
    table.unique(['name'], { indexName: 'buildings_name_unique' });
    table.string('address', 255).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('rooms', (table) => {
    table.increments('id').primary();
    table.integer('building_id').notNullable()
      .references('id').inTable('buildings').onDelete('RESTRICT');
    table.string('name', 120).notNullable();
    table.integer('capacity').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['building_id', 'name'], { indexName: 'rooms_building_id_name_unique' });
    table.check('capacity > 0', [], 'rooms_capacity_positive');
  });

  await knex.schema.createTable('reservations', (table) => {
    table.increments('id').primary();
    table.integer('room_id').notNullable()
      .references('id').inTable('rooms').onDelete('RESTRICT');
    table.string('reserved_by', 100).notNullable();
    table.integer('participants').notNullable();
    table.timestamp('start_time', { useTz: true }).notNullable();
    table.timestamp('end_time', { useTz: true }).notNullable();
    table.string('status', 20).notNullable().defaultTo('CONFIRMED');
    table.timestamp('cancelled_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check('end_time > start_time', [], 'reservations_time_order');
    table.check("status IN ('CONFIRMED', 'CANCELLED')", [], 'reservations_status_allowed');
    table.check('participants > 0', [], 'reservations_participants_positive');
    table.index(['room_id', 'start_time', 'end_time'], 'reservations_room_time_idx');
  });
}

export async function down(knex) {
  await knex.schema.dropTable('reservations');
  await knex.schema.dropTable('rooms');
  await knex.schema.dropTable('buildings');
}
