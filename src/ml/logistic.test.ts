import { describe, expect, it } from 'vitest';
import { chance, logLoss, outcomes, squash, stepLogistic, unsquash } from './logistic';
import { CHURN_DATA, CHURN_RATE, CHURN_STEPS, churnStart, mistakeCost, trainedChurnModel } from '../scenes/churn';
import { NEW_MEMBER } from '../data';

describe('classification', () => {
  it('squash turns any score into a chance, and unsquash undoes it', () => {
    expect(squash(0)).toBe(0.5);
    expect(squash(10)).toBeGreaterThan(0.99);
    expect(unsquash(squash(1.7))).toBeCloseTo(1.7);
  });

  it('the first rule (satisfaction under 5) makes 11 mistakes', () => {
    const o = outcomes(churnStart(), CHURN_DATA, 0.5);
    expect(o.missed + o.falseAlarms).toBe(11);
  });

  it('learning lowers the error score every step and cuts mistakes to 7', () => {
    const m = churnStart();
    let prev = logLoss(m, CHURN_DATA);
    for (let i = 0; i < CHURN_STEPS; i++) {
      stepLogistic(m, CHURN_DATA, CHURN_RATE);
      const now = logLoss(m, CHURN_DATA);
      expect(now).toBeLessThanOrEqual(prev + 1e-12);
      prev = now;
    }
    const o = outcomes(m, CHURN_DATA, 0.5);
    expect(o).toEqual({ caught: 7, missed: 4, falseAlarms: 3, leftAlone: 26 });
  });

  it('a 25% cutoff costs less than 50%, and is the cheapest on the cost chart', () => {
    const m = trainedChurnModel();
    expect(mistakeCost(outcomes(m, CHURN_DATA, 0.25))).toBe(860);
    expect(mistakeCost(outcomes(m, CHURN_DATA, 0.5))).toBe(1740);
    for (let c = 0.05; c <= 0.6; c += 0.01) {
      expect(mistakeCost(outcomes(m, CHURN_DATA, c))).toBeGreaterThanOrEqual(860);
    }
  });

  it('Sam is flagged at a 25% cutoff but not at 50%', () => {
    const p = chance(trainedChurnModel(), [NEW_MEMBER.months, NEW_MEMBER.satisfaction]);
    expect(p).toBeGreaterThan(0.25);
    expect(p).toBeLessThan(0.5);
  });
});
