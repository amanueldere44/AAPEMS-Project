import app from './app.js';
import { env } from './config/env.js';
import {
  verifyDatabaseConnection,
  closeDatabaseConnection,
} from './config/database.js';

let server;
let isShuttingDown = false;

async function startServer() {
  try {
    const database = await verifyDatabaseConnection();

    console.info('ASEMS database connection verified.', {
      database: database.database,
    });

    server = app.listen(env.PORT, () => {
      console.info('ASEMS API is ready.', {
        port: env.PORT,
        environment: env.NODE_ENV,
      });
    });

    server.on('error', (error) => {
      console.error('ASEMS HTTP server error.', {
        code: error.code,
        message: error.message,
      });

      void shutdown('SERVER_ERROR', 1);
    });
  } catch (error) {
    console.error('ASEMS startup failed.', {
      message: error.message,
      code: error.code,
    });

    await closeDatabaseConnection().catch(() => {});
    process.exitCode = 1;
  }
}

async function shutdown(signal, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.info(`ASEMS shutdown started: ${signal}`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    await closeDatabaseConnection();
  } catch (error) {
    console.error('ASEMS shutdown encountered an error.', {
      message: error.message,
    });

    exitCode = 1;
  } finally {
    clearTimeout(forceExitTimer);
    process.exitCode = exitCode;
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void startServer();