import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url().default('postgresql://hemosync:hemosync@localhost:5432/hemosync')
});

export const env = environmentSchema.parse(process.env);
