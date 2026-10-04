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

/** Next week's plan, and what actually happened (shown only after the forecast). */
export const PLANNED_SPEND = 7;
export const ACTUAL_NEXT_WEEK = 160;
