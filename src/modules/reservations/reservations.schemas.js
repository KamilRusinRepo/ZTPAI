import { z } from 'zod';

const urlId = z.string().regex(/^\d+$/).pipe(z.coerce.number().int().positive());

export const idParams = z.object({ id: urlId });

export const createReservationBody = z.object({
  roomId: z.number().int().positive(),
  participants: z.number().int().positive(),
  startTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
  endTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
}).strict();

const queryDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString());
const positiveQueryInteger = z.string().regex(/^\d+$/).pipe(z.coerce.number().int().positive());

export const listReservationsQuery = z.object({
  roomId: positiveQueryInteger.pipe(z.number().max(2147483647)).optional(),
  buildingId: positiveQueryInteger.pipe(z.number().max(2147483647)).optional(),
  status: z.enum(['CONFIRMED', 'CANCELLED']).optional(),
  from: queryDate.optional(),
  to: queryDate.optional(),
  page: positiveQueryInteger.default(1),
  limit: positiveQueryInteger.pipe(z.number().max(100)).default(20),
  sort: z.enum(['startTime', '-startTime', 'createdAt', '-createdAt', 'participants', '-participants']).default('startTime'),
}).strict().superRefine((query, ctx) => {
  if (query.from && query.to && new Date(query.from) >= new Date(query.to)) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must be later than from' });
  }
  if (!Number.isSafeInteger((query.page - 1) * query.limit)) {
    ctx.addIssue({ code: 'custom', path: ['page'], message: 'Pagination offset is too large' });
  }
});
