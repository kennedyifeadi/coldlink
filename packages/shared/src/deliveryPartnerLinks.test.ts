import { describe, expect, it } from 'vitest';
import {
  DELIVERY_ACTION_ROUTE,
  deliveryActionPath,
  partnerDeliveryActionBodySchema,
} from './deliveryPartnerLinks.js';

describe('deliveryActionPath', () => {
  it('puts the token in the short /d/ route', () => {
    expect(DELIVERY_ACTION_ROUTE).toBe('/d/:token');
    expect(deliveryActionPath('Hk3_q-9ZxYv0LmN2pQrStUvWxYz0123456789abcDE')).toBe(
      '/d/Hk3_q-9ZxYv0LmN2pQrStUvWxYz0123456789abcDE',
    );
  });

  it('takes a token with $ patterns literally', () => {
    expect(deliveryActionPath('a$&b')).toBe('/d/a$&b');
  });
});

describe('partnerDeliveryActionBodySchema', () => {
  it.each(['accept', 'decline', 'picked_up'])('takes %s on its own', (action) => {
    expect(partnerDeliveryActionBodySchema.parse({ action })).toEqual({ action });
  });

  it('takes delivered with a 4-digit code, leading zero kept', () => {
    expect(
      partnerDeliveryActionBodySchema.parse({ action: 'delivered', handover_code: '0427' }),
    ).toEqual({ action: 'delivered', handover_code: '0427' });
  });

  it.each([
    ['delivered without a code', { action: 'delivered' }],
    ['a code of 3 digits', { action: 'delivered', handover_code: '427' }],
    ['a code as a number', { action: 'delivered', handover_code: 427 }],
    ['a code with letters', { action: 'delivered', handover_code: '04a7' }],
    ['a code on another step', { action: 'picked_up', handover_code: '0427' }],
    ['an unknown action', { action: 'reject' }],
  ])('refuses %s', (_case, body) => {
    expect(partnerDeliveryActionBodySchema.safeParse(body).success).toBe(false);
  });
});
