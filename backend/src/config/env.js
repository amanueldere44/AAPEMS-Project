import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(5000),

    FRONTEND_ORIGIN: z
      .string()
      .url()
      .default('http://127.0.0.1:5173'),

    DB_HOST: z.string().trim().min(1).default('localhost'),

    DB_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(3306),

    DB_USER: z.string().trim().min(1).default('asems_app'),

    DB_PASSWORD: z.string().default(''),

    DB_NAME: z
      .string()
      .trim()
      .min(1)
      .default('ambo_performance_evaluation'),

    DB_CONNECTION_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10),

    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must contain at least 32 characters.')
      .refine(
        (value) =>
          !value.toLowerCase().includes('replace_with') &&
          !value.toLowerCase().includes('change_me'),
        'Replace the example JWT_SECRET with a real random secret.',
      ),

    JWT_EXPIRES_IN: z.string().trim().min(2).default('15m'),
  })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === 'production' &&
      config.DB_PASSWORD.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DB_PASSWORD'],
        message: 'A database password is required in production.',
      });
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('ASEMS configuration validation failed:');

  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join('.')}: ${issue.message}`);
  }

  process.exit(1);
}

export const env = Object.freeze(result.data);