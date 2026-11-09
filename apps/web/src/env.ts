import * as z from 'zod';

const apiUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.startsWith('/') || URL.canParse(value), {
    message: 'VITE_API_URL must be a path such as /api/v1 or an absolute URL',
  })
  .transform((value) => value.replace(/\/+$/, ''));

const envSchema = z.object({
  // Defaults to the same origin, which the Vite dev proxy forwards to the API.
  VITE_API_URL: apiUrlSchema.default('/api/v1'),
});

export type Env = z.infer<typeof envSchema>;

export const parseEnv = (source: Record<string, unknown>): Env => {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid web environment: ${z.prettifyError(result.error)}`);
  }
  return result.data;
};

export const env = parseEnv(import.meta.env);
