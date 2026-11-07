import bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '../../modules/auth/auth.service.js';

export const demoUserEmails = [
  'jan.kowalski@seed.example.invalid',
  'anna.nowak@seed.example.invalid',
  'piotr.wisniewski@seed.example.invalid',
  'maria.wojcik@seed.example.invalid',
  'adam.kowalski@seed.example.invalid',
];

// Public credentials for the local demonstration database only.
export async function seed(knex) {
  const passwordHash = await bcrypt.hash('admin-password-123', BCRYPT_ROUNDS);
  await knex('users').insert({
    email: 'admin@example.com', password_hash: passwordHash, role: 'ADMIN',
  }).onConflict('email').merge(['password_hash', 'role']);
  for (const email of demoUserEmails) {
    const userHash = await bcrypt.hash('user-password-123', BCRYPT_ROUNDS);
    await knex('users').insert({ email, password_hash: userHash, role: 'USER' })
      .onConflict('email').merge(['password_hash', 'role']);
  }
}
