import { pino, type DestinationStream, type LogFn, type Logger } from 'pino';
import type { Config } from './config.js';
import { redact } from './redact.js';

export function serializeError(err: Error): unknown {
  return redact({ ...pino.stdSerializers.err(err) });
}

export function createLogger(level: Config['logLevel'], destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      hooks: {
        logMethod(args, method) {
          method.apply(this, args.map(redact) as Parameters<LogFn>);
        },
      },
      serializers: { err: serializeError },
    },
    destination,
  );
}
