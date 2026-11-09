const NO_BREAK_SPACE = ' ';

/** +2348031234567 as +234 803 123 4567, kept on one line, for showing a user their number. */
export const formatPhoneForDisplay = (phone: string) =>
  [phone.slice(0, 4), phone.slice(4, 7), phone.slice(7, 10), phone.slice(10)].join(NO_BREAK_SPACE);

/** 42 as 0:42, 75 as 1:15. */
export const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
