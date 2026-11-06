import bcrypt from 'bcryptjs';
import { ConflictError } from '../../errors/AppError.js';

export const BCRYPT_ROUNDS = 12;

export function createAuthService({ usersRepository }) {
  return {
    async register({ email, password }) {
      email = email.toLowerCase();
      if (await usersRepository.findByEmail(email)) {
        throw new ConflictError('Email already registered', 'EMAIL_TAKEN');
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      try {
        return await usersRepository.create({ email, passwordHash, role: 'USER' });
      } catch (error) {
        // UNIQUE remains authoritative when concurrent requests pass the lookup.
        if (error.code === '23505' && error.constraint === 'users_email_unique') {
          throw new ConflictError('Email already registered', 'EMAIL_TAKEN');
        }
        throw error;
      }
    },
  };
}
