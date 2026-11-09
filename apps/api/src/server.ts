import { createApp } from './app.js';
import { createBackgroundTasks } from './backgroundTasks.js';
import { ConfigError, loadConfig, type Config } from './config.js';
import { createDatabase } from './db/client.js';
import { createLogger } from './logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function readConfig(): Config {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = readConfig();
const logger = createLogger(config.logLevel);
const db = createDatabase(config, logger);
const tasks = createBackgroundTasks();

const server = createApp(config, { db, logger, tasks }).listen(config.port, (error) => {
  if (error) {
    logger.fatal({ err: error }, 'API failed to start');
    process.exit(1);
  }
  logger.info({ port: config.port, env: config.nodeEnv }, 'API listening');
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down');
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Shutdown failed');
      process.exit(1);
    }
    // In-flight SMS sends finish before the pool they write to closes.
    tasks
      .drain()
      .then(() => db.destroy())
      .then(
        () => process.exit(0),
        (err: unknown) => {
          logger.error({ err }, 'Closing the database pool failed');
          process.exit(1);
        },
      );
  });
  server.closeIdleConnections();
  setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
