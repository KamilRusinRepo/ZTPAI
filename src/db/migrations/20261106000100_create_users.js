export async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('email', 254).notNullable();
    table.unique(['email'], { indexName: 'users_email_unique' });
    table.string('password_hash', 100).notNullable();
    table.string('role', 20).notNullable().defaultTo('USER');
    table.check("role IN ('USER', 'ADMIN')", [], 'users_role_check');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTable('users');
}
