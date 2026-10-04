// Yes/no classification (logistic regression), written out in full.
//
//   risk score = start + w₁ × x₁ + w₂ × x₂
//   chance     = squash(risk score) = 1 ÷ (1 + e^(−risk score))      always between 0% and 100%
//   flag       = chance ≥ cutoff

import type { MultiModel } from './linear';

export interface Labelled {
  x: readonly number[];
  yes: boolean;
}

export const squash = (z: number): number => 1 / (1 + Math.exp(-z));
/** The risk score that gives a chance of exactly p (inverse of squash). */
export const unsquash = (p: number): number => Math.log(p / (1 - p));

export function riskScore(m: MultiModel, x: readonly number[]): number {
  let z = m.start;
  for (let i = 0; i < m.weights.length; i++) z += m.weights[i] * x[i];
  return z;
}

export const chance = (m: MultiModel, x: readonly number[]): number => squash(riskScore(m, x));

/**
 * Error score (log loss): for each customer, how surprised the AI model was by what really
 * happened. Confident and wrong costs a lot; confident and right costs almost nothing.
 */
export function logLoss(m: MultiModel, data: readonly Labelled[]): number {
  let sum = 0;
  for (const d of data) {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, chance(m, d.x)));
    sum -= d.yes ? Math.log(p) : Math.log(1 - p);
  }
  return sum / Math.max(1, data.length);
}

/** One learning step: nudge every number downhill on the error score. */
export function stepLogistic(m: MultiModel, data: readonly Labelled[], rate: number): void {
  const n = Math.max(1, data.length);
  let dStart = 0;
  const dW = m.weights.map(() => 0);
  for (const d of data) {
    const miss = chance(m, d.x) - (d.yes ? 1 : 0);
    dStart += miss;
    for (let i = 0; i < dW.length; i++) dW[i] += miss * d.x[i];
  }
  m.start -= (rate * dStart) / n;
  for (let i = 0; i < dW.length; i++) m.weights[i] -= (rate * dW[i]) / n;
}

export interface Outcomes {
  /** Cancelled, and we flagged them. */
  caught: number;
  /** Cancelled, but we did not flag them. */
  missed: number;
  /** Stayed, but we flagged them anyway. */
  falseAlarms: number;
  /** Stayed, and we left them alone. */
  leftAlone: number;
}

export function outcomes(m: MultiModel, data: readonly Labelled[], cutoff: number): Outcomes {
  const o: Outcomes = { caught: 0, missed: 0, falseAlarms: 0, leftAlone: 0 };
  for (const d of data) {
    const flagged = chance(m, d.x) >= cutoff;
    if (d.yes) flagged ? o.caught++ : o.missed++;
    else flagged ? o.falseAlarms++ : o.leftAlone++;
  }
  return o;
}
