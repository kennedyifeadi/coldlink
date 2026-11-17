import { describe, expect, it } from 'vitest';
import type { PaymentStatus } from '@coldlink/shared';
import { dugbeBooking, paidDugbeBooking } from '../../test/bookingFixtures';
import { readHeldBookingId, readReturnOutcome, whatsappShareUrl } from './paymentFlow';

const beforeHoldEnds = Date.parse('2026-11-10T09:29:00Z');
const afterHoldEnds = Date.parse('2026-11-10T09:31:00Z');

describe('readReturnOutcome', () => {
  it.each<PaymentStatus>(['initiated', 'failed', 'success'])(
    'is paid once the booking has moved on, whatever this charge says (%s)',
    (status) => {
      expect(readReturnOutcome(status, paidDugbeBooking(), afterHoldEnds)).toBe('paid');
    },
  );

  it.each<PaymentStatus>(['success', 'refunded', 'partially_refunded'])(
    'is a late refund when a %s charge never moved the booking on',
    (status) => {
      expect(readReturnOutcome(status, dugbeBooking({ status: 'expired' }), afterHoldEnds)).toBe(
        'lateRefund',
      );
      expect(readReturnOutcome(status, dugbeBooking(), afterHoldEnds)).toBe('lateRefund');
    },
  );

  it.each<PaymentStatus>(['initiated', 'failed'])(
    'is not finished while the hold runs, and expired after (%s)',
    (status) => {
      expect(readReturnOutcome(status, dugbeBooking(), beforeHoldEnds)).toBe('notFinished');
      expect(readReturnOutcome(status, dugbeBooking(), afterHoldEnds)).toBe('holdExpired');
    },
  );

  it('treats the exact end of the hold as expired', () => {
    expect(readReturnOutcome('initiated', dugbeBooking(), Date.parse('2026-11-10T09:30:00Z'))).toBe(
      'holdExpired',
    );
  });
});

describe('readHeldBookingId', () => {
  it('reads an id, no id, or an edited one', () => {
    const id = dugbeBooking().id;
    expect(readHeldBookingId(new URLSearchParams({ booking: id }))).toBe(id);
    expect(readHeldBookingId(new URLSearchParams())).toBeNull();
    expect(readHeldBookingId(new URLSearchParams({ booking: 'abc' }))).toBeUndefined();
  });
});

describe('whatsappShareUrl', () => {
  it('encodes the text for any chat', () => {
    expect(whatsappShareUrl('Code CL-7KQ2M & 14 Road')).toBe(
      'https://wa.me/?text=Code%20CL-7KQ2M%20%26%2014%20Road',
    );
  });
});
