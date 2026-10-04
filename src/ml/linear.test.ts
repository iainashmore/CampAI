import { describe, expect, it } from 'vitest';
import { bestFit, meanSquaredError, predict, step } from './linear';
import { AD_WEEKS } from '../data';
import { FORECAST_RATE, FORECAST_START } from '../scenes/forecast';

describe('line regression', () => {
  it('scores a line by its average squared miss', () => {
    const data = [{ x: 0, y: 1 }, { x: 1, y: 3 }];
    // Line y = 1 + 1x misses the second point by 1: (0² + 1²) / 2 = 0.5
    expect(meanSquaredError({ start: 1, slope: 1 }, data)).toBeCloseTo(0.5);
  });

  it('learns the best line for the ad data from the on-screen first guess', () => {
    const m = { ...FORECAST_START };
    const before = meanSquaredError(m, AD_WEEKS);
    for (let i = 0; i < 3000; i++) step(m, AD_WEEKS, FORECAST_RATE);
    const best = bestFit(AD_WEEKS);
    expect(meanSquaredError(m, AD_WEEKS)).toBeLessThan(before / 10);
    expect(m.slope).toBeCloseTo(best.slope, 1);
    expect(m.start).toBeCloseTo(best.start, 0);
  });

  it('error never rises while learning (rate is stable)', () => {
    const m = { ...FORECAST_START };
    let prev = meanSquaredError(m, AD_WEEKS);
    for (let i = 0; i < 500; i++) {
      step(m, AD_WEEKS, FORECAST_RATE);
      const now = meanSquaredError(m, AD_WEEKS);
      expect(now).toBeLessThanOrEqual(prev + 1e-9);
      prev = now;
    }
  });

  it('predicts along the line', () => {
    expect(predict({ start: 40, slope: 18 }, 7)).toBe(166);
  });
});
