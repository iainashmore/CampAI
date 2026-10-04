import { describe, expect, it } from 'vitest';
import { meanSquaredErrorMany, stepMany } from './linear';
import { PLANE_DATA, PLANE_RATE, planeStart } from '../scenes/forecast3d';

describe('plane regression (ads + emails)', () => {
  it('starts as the ads-only line, so the error matches the 2D scene', () => {
    expect(meanSquaredErrorMany(planeStart(), PLANE_DATA)).toBeCloseTo(51, 0);
  });

  it('learns a plane that beats the line by a wide margin, without the error ever rising', () => {
    const m = planeStart();
    let prev = meanSquaredErrorMany(m, PLANE_DATA);
    for (let i = 0; i < 4000; i++) {
      stepMany(m, PLANE_DATA, PLANE_RATE);
      const now = meanSquaredErrorMany(m, PLANE_DATA);
      expect(now).toBeLessThanOrEqual(prev + 1e-9);
      prev = now;
    }
    expect(prev).toBeLessThan(8);
    expect(m.weights[1]).toBeGreaterThan(2);
  });
});
