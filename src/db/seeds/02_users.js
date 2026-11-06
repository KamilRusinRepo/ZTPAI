import bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '../../modules/auth/auth.service.js';

// Public credentials for the local demonstration database only.
export async function seed(knex) {
  const passwordHash = await bcrypt.hash('admin-password-123', BCRYPT_ROUNDS);
  await knex('users').insert({
    email: 'admin@example.com', password_hash: passwordHash, role: 'ADMIN',
  }).onConflict('email').merge(['password_hash', 'role']);
}
