import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,

  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  queueLimit: 0,

  charset: 'utf8mb4',
  timezone: 'Z',

  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  // Keep BIGINT and DECIMAL values predictable.
  // Convert values explicitly in service code when needed.
  supportBigNumbers: true,
  bigNumberStrings: true,
  decimalNumbers: false,
});

export async function verifyDatabaseConnection() {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.query(`
      SELECT
        1 AS connection_ok,
        DATABASE() AS database_name,
        CURRENT_TIMESTAMP AS database_time
    `);

    const result = rows[0];

    if (result.database_name !== env.DB_NAME) {
      throw new Error('Connected database does not match DB_NAME.');
    }

    return {
      connected: true,
      database: result.database_name,
      databaseTime: result.database_time,
    };
  } finally {
    connection.release();
  }
}

export async function closeDatabaseConnection() {
  await pool.end();
}