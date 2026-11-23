import { createApp } from './app.js';
import { createBackgroundTasks } from './backgroundTasks.js';
import { ConfigError, loadConfig, type Config } from './config.js';
import { createDatabase } from './db/client.js';
import { createJobs } from './jobs/index.js';
import { runJob } from './jobs/runner.js';
import { createScheduler } from './jobs/scheduler.js';
import { createLogger } from './logger.js';
import { apiRoutes } from './routes/index.js';
import { createBookingServices } from './services.js';
import { createShutdown } from './shutdown.js';

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
// One set of hooks, so a job's transitions refund and text exactly as a route's do.
const services = createBookingServices({ db, config, logger });
const routes = apiRoutes({ db, config, logger, tasks, services });
const scheduler = createScheduler({
  jobs: createJobs({ db, logger, services }),
  logger,
  run: (job, signal) => runJob(db, logger, job, { signal }),
});

const server = createApp(config, { db, logger, tasks, routes }).listen(config.port, (error) => {
  if (error) {
    logger.fatal({ err: error }, 'API failed to start');
    process.exit(1);
  }
  logger.info({ port: config.port, env: config.nodeEnv }, 'API listening');
  if (config.jobsEnabled) {
    scheduler.start();
  } else {
    logger.info('Scheduled jobs are off (JOBS_ENABLED=false)');
  }
});

const shutdown = createShutdown({
  server,
  scheduler,
  tasks,
  db,
  logger,
  exit: (code) => process.exit(code),
});
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
