import { z } from 'zod';

const authEnvSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must have at least 32 characters'),
  JWT_EXPIRES_IN: z.string().regex(/^[1-9]\d*(s|m|h|d)$/, 'JWT_EXPIRES_IN must be a positive duration, e.g. 15m or 10s').default('15m'),
});

export function loadAuthConfig(env) {
  const result = authEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error('Invalid authentication configuration:\n' + result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
  }
  return Object.freeze({ jwtSecret: result.data.JWT_SECRET, jwtExpiresIn: result.data.JWT_EXPIRES_IN });
}
