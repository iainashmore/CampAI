// Daily Grind: the made-up coffee subscription company every scene follows.
// Data is fixed (not random) so the presenter sees the same numbers every rehearsal.

import type { Point } from './ml/linear';

export const COMPANY = 'Daily Grind';

/** Twelve weeks of ad spend ($ thousands) and the new subscribers each week brought. */
export const AD_WEEKS: readonly Point[] = (() => {
  const spend = [1.2, 2.0, 2.6, 3.1, 3.5, 4.0, 4.4, 4.9, 5.3, 5.8, 1.6, 3.8];
  const noise = [6, -9, 4, -5, 11, -7, 3, -12, 8, -4, -6, 5];
  return spend.map((x, i) => ({ x, y: Math.round(40 + 18 * x + noise[i]) }));
})();

/**
 * Marketing emails sent each of the same twelve weeks (thousands). Weeks that beat the ads-only
 * line were mostly big email weeks, so a second input explains most of the leftover misses.
 */
export const EMAILS_SENT: readonly number[] = [7, 0, 4.5, 3.5, 6.5, 2.5, 5, 1, 5.5, 2.5, 3, 4.5];

/** Next week's plan, and what actually happened (shown only after the forecast). */
export const PLANNED_SPEND = 7;
export const ACTUAL_NEXT_WEEK = 160;

export interface Customer {
  /** Months as a member when we looked. */
  months: number;
  /** Last satisfaction survey score, 0 to 10. */
  satisfaction: number;
  /** Did they cancel within the next three months? */
  cancelled: boolean;
}

/** Forty past members and whether they cancelled. */
export const CUSTOMERS: readonly Customer[] = (
  [
    [1, 7.1, 0], [10, 1.7, 0], [10, 6.2, 0], [17, 5.6, 0], [10, 7.6, 0], [1, 2.3, 1], [14, 4.1, 0], [1, 0.4, 1],
    [4, 8.7, 0], [9, 2.2, 1], [11, 8.7, 0], [11, 5.4, 1], [7, 5.8, 0], [16, 6, 0], [21, 4.2, 0], [17, 2.1, 0],
    [22, 2.6, 0], [9, 1.3, 0], [8, 4.9, 1], [19, 3.7, 0], [4, 7.3, 0], [7, 3.2, 0], [14, 6.3, 0], [19, 5.4, 0],
    [4, 6, 0], [17, 9.9, 0], [21, 2.8, 0], [10, 8.1, 0], [7, 1.1, 1], [24, 9.7, 0], [22, 6.2, 0], [5, 1.5, 1],
    [1, 9.2, 0], [5, 4, 1], [16, 0.9, 1], [4, 9.2, 0], [7, 4.2, 1], [4, 2.8, 1], [21, 9.4, 0], [21, 4.5, 0],
  ] as const
).map(([months, satisfaction, c]) => ({ months, satisfaction, cancelled: c === 1 }));

/** A year of boxes at $30 a month: what a cancelling member costs us. */
export const LOST_MEMBER_COST = 360;
/** What a "please stay" offer costs us: $100 of free coffee. */
export const OFFER_COST = 100;

/** A new member to score at the end of the scene. */
export const NEW_MEMBER = { name: 'Sam', months: 4, satisfaction: 5.5 };
