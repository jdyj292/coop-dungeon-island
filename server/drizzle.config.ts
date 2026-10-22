// drizzle-kit 설정: schema.ts → src/db/migrations/*.sql (pnpm --filter @game/server db:generate)
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
