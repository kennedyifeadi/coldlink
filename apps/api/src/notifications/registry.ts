import type { ProviderActionLinks } from './bookingSmsHooks.js';
import { createBookingSmsTemplates } from './bookingTemplates.js';
import { smsTemplates } from './templates.js';

/**
 * Every SMS template the API sends, the one registry both the routes and the scheduled jobs use,
 * so the queue can rerender any message either of them logged.
 */
export function createSmsTemplateRegistry(links: ProviderActionLinks) {
  return {
    ...smsTemplates,
    ...createBookingSmsTemplates({ relinkProvider: (bookingId) => links.reissue(bookingId) }),
  };
}

export type SmsTemplateRegistry = ReturnType<typeof createSmsTemplateRegistry>;
