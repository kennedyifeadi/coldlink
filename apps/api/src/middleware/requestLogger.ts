import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { redact, redactUrl } from '../redact.js';

// Request bodies are never logged: they carry phone numbers and OTPs.
export function requestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customLogLevel: (_req, res, err) => {
      if (err !== undefined || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req: IncomingMessage & { id: unknown }) => ({
        id: req.id,
        method: req.method,
        url: redactUrl(req.url ?? ''),
        headers: redact(req.headers),
      }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      err: (err: object) => redact({ ...err }),
    },
  });
}
