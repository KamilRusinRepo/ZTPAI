import { z } from 'zod';

export const registerBody = z.object({
  email: z.email().max(254).toLowerCase(),
  password: z.string()
    .min(10, 'Password must have at least 10 characters')
    .max(72, 'Password can have at most 72 characters')
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password can have at most 72 UTF-8 bytes'),
}).strict();

export const loginBody = z.object({
  email: z.email().max(254).toLowerCase(),
  password: z.string().min(1),
}).strict();
