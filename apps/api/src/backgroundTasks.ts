import type { Logger } from 'pino';

/** Work that runs after the response has gone, such as sending an SMS. */
export interface BackgroundTasks {
  /** Starts the task. A failure is logged at error level with `failureMessage`, never dropped. */
  run(logger: Logger, failureMessage: string, task: () => Promise<unknown>): void;
  /** Resolves once every started task has settled, for shutdown and tests. */
  drain(): Promise<void>;
}

export function createBackgroundTasks(): BackgroundTasks {
  const pending = new Set<Promise<void>>();
  return {
    run(logger, failureMessage, task) {
      const settled: Promise<void> = Promise.resolve()
        .then(task)
        .then(
          () => undefined,
          (err: unknown) => {
            logger.error({ err }, failureMessage);
          },
        )
        .finally(() => pending.delete(settled));
      pending.add(settled);
    },
    async drain() {
      while (pending.size > 0) await Promise.all(pending);
    },
  };
}
