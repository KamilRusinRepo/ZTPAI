import { z } from 'zod';

const positiveInteger = z.string().regex(/^\d+$/).pipe(z.coerce.number().int().positive());
export const auditLogQuery = z.object({
  eventType: z.string().min(1).max(100).optional(),
  page: positiveInteger.default(1),
  limit: positiveInteger.pipe(z.number().max(100)).default(20),
}).strict().superRefine((query, ctx) => {
  if (!Number.isSafeInteger((query.page - 1) * query.limit)) {
    ctx.addIssue({ code: 'custom', path: ['page'], message: 'Pagination offset is too large' });
  }
});
