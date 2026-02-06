import { z } from 'zod';
import { config } from 'dotenv';

config();

const envSchema = z.object({
  // RPC Configuration
  MONAD_RPC_URL: z.string().url().default('https://rpc.monad.xyz'),
  MONAD_RPC_URL_BACKUP: z.string().url().default('https://rpc2.monad.xyz'),

  // Wallet - now optional since we have wallet manager
  AGENT_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid private key format')
    .optional()
    .default('0x0000000000000000000000000000000000000000000000000000000000000000'),

  // Agent Settings
  AGENT_NAME: z.string().default('CrownSK'),
  MAX_SINGLE_TX_MON: z.coerce.number().default(10),
  DAILY_LIMIT_MON: z.coerce.number().default(50),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Environment validation failed:');
    for (const issue of parsed.error.issues) {
      // SECURITY: Don't print private key values in error messages
      if (issue.path.includes('PRIVATE_KEY')) {
        console.error(`  ${issue.path.join('.')}: Invalid format`);
      } else {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`);
      }
    }
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
