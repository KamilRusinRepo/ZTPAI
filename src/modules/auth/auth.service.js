import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ConflictError, UnauthorizedError } from '../../errors/AppError.js';

export const BCRYPT_ROUNDS = 12;

export function createAuthService({ usersRepository, jwtSecret, jwtExpiresIn = '15m' }) {
  return {
    async login({ email, password }) {
      const user = await usersRepository.findByEmail(email.toLowerCase());
      const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
      if (!user || !passwordOk) throw new UnauthorizedError('Invalid email or password');
      const accessToken = jwt.sign({ role: user.role }, jwtSecret, {
        subject: String(user.id), algorithm: 'HS256', expiresIn: jwtExpiresIn,
      });
      return { accessToken, tokenType: 'Bearer', expiresIn: jwtExpiresIn };
    },
    async getCurrentUser(id) {
      const user = await usersRepository.findById(id);
      if (!user) throw new UnauthorizedError('User no longer exists');
      return user;
    },
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
