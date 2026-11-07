import { z } from 'zod';

export const idParams = z.object({ id: z.string().regex(/^\d+$/).pipe(z.coerce.number().int().positive()) });
export const createBuildingBody = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(255),
}).strict();

export const updateBuildingBody = createBuildingBody.partial()
  .refine((body) => Object.keys(body).length > 0, 'At least one field is required');
