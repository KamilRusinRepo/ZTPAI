import { z } from 'zod';

export const createRoomBody = z.object({
  buildingId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  capacity: z.number().int().positive().max(2147483647),
}).strict();

export const updateRoomBody = createRoomBody.partial()
  .refine((body) => Object.keys(body).length > 0, 'At least one field is required');

export const idParams = z.object({
  id: z.string().regex(/^\d+$/).pipe(z.coerce.number().int().positive()),
});
