import mysql, { type Pool } from 'mysql2/promise';
import { env } from '../config/env';

let pool: Pool | null = null;

export function getMysqlPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT,
      database: env.MYSQL_DATABASE,
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }

  return pool;
}

export async function closeMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
