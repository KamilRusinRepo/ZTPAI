import { z } from 'zod';

const urlId = z.string().regex(/^\d+$/).pipe(z.coerce.number().int().positive());

export const idParams = z.object({ id: urlId });

export const createReservationBody = z.object({
  roomId: z.number().int().positive(),
  reservedBy: z.string().trim().min(3).max(100),
  participants: z.number().int().positive(),
  startTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
  endTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
}).strict();

export const listReservationsQuery = z.object({ roomId: urlId.optional() });
