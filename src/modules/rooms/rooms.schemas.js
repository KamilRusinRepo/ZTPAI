import { z } from 'zod';

export const idParams = z.object({
  id: z.string().regex(/^\d+$/).pipe(z.coerce.number().int().positive()),
});
