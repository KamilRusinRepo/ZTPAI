import { z } from 'zod';

export const createRoomBody = z.object({
  buildingId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  capacity: z.number().int().positive().max(2147483647),
}).strict();

export const idParams = z.object({
  id: z.string().regex(/^\d+$/).pipe(z.coerce.number().int().positive()),
});
