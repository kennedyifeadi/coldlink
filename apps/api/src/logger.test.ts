import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { captureLogs, testApp } from './test/helpers.js';

const phone = '08031234567';
const internationalPhone = '+2348031234567';
const token = 'eyJhbGciOiJIUzI1NiJ9.secret-token';

describe('logger', () => {
  it('redacts phone numbers and tokens in log objects and messages', () => {
    const { logger, output } = captureLogs();
    logger.info(
      { phone, token, otp: '482913', farmer: { contact: internationalPhone } },
      'OTP sent',
    );
    logger.info(`Sending SMS to ${phone}`);
    logger.error({ err: new Error(`SMS to ${internationalPhone} failed`) }, 'SMS failed');

    const text = output();
    expect(text).not.toContain('8031234567');
    expect(text).not.toContain(token);
    expect(text).not.toContain('482913');
    expect(text).toContain('[Redacted phone]');
  });

  it('keeps phone numbers, tokens and bodies out of request logs', async () => {
    const { app, logs } = testApp();
    await request(app)
      .post(`/api/v1/health?phone=${phone}&token=${token}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', `refresh_token=${token}`)
      .send({ phone, otp: '482913' });

    const text = logs.output();
    expect(text).toContain('"url":"/api/v1/health?phone=[Redacted]&token=[Redacted]"');
    expect(text).not.toContain('8031234567');
    expect(text).not.toContain(token);
    expect(text).not.toContain('482913');
  });

  it.each(['/api/v1/users/8012345678', '/api/v1/y?q=%2B234%20801%20234%205678'])(
    'masks the phone number in the request log for %s',
    async (url) => {
      const { app, logs } = testApp();
      await request(app).get(url);
      const text = logs.output();
      expect(text).toContain('[Redacted phone]');
      expect(text).not.toMatch(/801(%20|\s)?234(%20|\s)?5678/);
    },
  );
});
