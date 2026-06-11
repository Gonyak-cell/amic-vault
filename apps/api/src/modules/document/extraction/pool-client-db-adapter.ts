import type { PoolClient } from 'pg';
import type { Db } from 'pg-boss';

export function pgBossDbFromPoolClient(client: PoolClient): Db {
  return {
    async executeSql(text: string, values?: unknown[]) {
      const result = await client.query(text, values ?? []);
      return { rows: result.rows };
    },
  };
}
