import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp as buildApp } from '../../src/app.js';
import { createReservationsRepository as buildRepository } from '../../src/modules/reservations/reservations.repository.memory.js';

export const currentUser = { id: 1, role: 'USER' };
export const publicUser = { id: 1, email: 'test@example.com' };
export const jwtSecret = randomBytes(48).toString('base64');
export const authorization = 'Bearer ' + jwt.sign({ role: currentUser.role }, jwtSecret,
  { subject: String(currentUser.id), algorithm: 'HS256', expiresIn: '15m' });
const usersRepository = {
  async findById(id) { return id === 1 ? { ...publicUser, role: 'USER', createdAt: '2026-01-01T00:00:00Z' } : null; },
};

export function createApp(options) {
  return buildApp({ jwtSecret, usersRepository, ...options });
}

export function createReservationsRepository(options = {}) {
  return buildRepository({ usersRepository, ...options });
}
