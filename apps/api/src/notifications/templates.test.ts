import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { smsTemplates, type TemplateParams } from './templates.js';

type Templates = typeof smsTemplates;

// The longest text each template can render. Typed so that a new template fails typecheck until
// it is added here and checked against one segment.
const longestParams: { [Name in keyof Templates]: TemplateParams<Templates, Name> } = {
  otp: { code: '999999', expires_in_minutes: 60 },
};

// The GSM 03.38 basic set without the characters a phone may swap or that need an escape. Any
// other character switches the message to UCS-2, where one segment holds only 70.
const GSM_SAFE = /^[A-Za-z0-9 \n.,:;!?'"()@£$%&*+\-/<=>#_]*$/;
const SEGMENT_LENGTH = 160;

describe('SMS templates', () => {
  it.each(Object.entries(longestParams))('%s fits one SMS segment', (name, params) => {
    const { text } = smsTemplates[name as keyof Templates].prepare(params);
    expect(text).toMatch(GSM_SAFE);
    expect(text.length).toBeLessThanOrEqual(SEGMENT_LENGTH);
  });

  describe('otp', () => {
    it('renders the code and expiry in plain English', () => {
      expect(smsTemplates.otp.prepare({ code: '123456', expires_in_minutes: 10 }).text).toBe(
        "Your ColdLink code is 123456. It expires in 10 minutes. Don't share it.",
      );
    });

    it('stores the expiry but never the code', () => {
      const { payload } = smsTemplates.otp.prepare({ code: '123456', expires_in_minutes: 10 });
      expect(payload).toEqual({ expires_in_minutes: 10 });
      expect(JSON.stringify(payload)).not.toContain('123456');
    });

    it('is never retried', () => {
      expect(smsTemplates.otp.retryable).toBe(false);
    });

    it.each([
      { code: '12345', expires_in_minutes: 10 },
      { code: '12345a', expires_in_minutes: 10 },
      { code: '123456', expires_in_minutes: 0 },
      { code: '123456' },
    ])('rejects invalid params %j', (params) => {
      expect(() => smsTemplates.otp.prepare(params)).toThrow(z.ZodError);
    });
  });
});
