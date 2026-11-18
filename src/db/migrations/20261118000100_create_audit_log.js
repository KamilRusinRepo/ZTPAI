export async function up(knex) {
  await knex.schema.createTable('audit_log', (table) => {
    table.bigIncrements('id').primary();
    table.string('event_type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable();
    table.index(['created_at', 'id'], 'audit_log_created_idx');
    table.index(['event_type', 'created_at', 'id'], 'audit_log_event_created_idx');
  });
}

export async function down(knex) {
  await knex.schema.dropTable('audit_log');
}
