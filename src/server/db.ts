import postgres from "postgres";
import { env } from "./env";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

declare global {
  // eslint-disable-next-line no-var
  var __reinaSql: Sql | undefined;
}

// `prepare: false` : compatible avec le pooler transactionnel de Supabase (port 6543).
export function getSql(): Sql {
  if (!globalThis.__reinaSql) {
    globalThis.__reinaSql = postgres(env.databaseUrl(), {
      max: 10,
      prepare: false,
      idle_timeout: 20,
      onnotice: () => {},
    });
  }
  return globalThis.__reinaSql;
}
