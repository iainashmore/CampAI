// Straight-line regression learned by gradient descent, written out in full so every
// number on screen comes from here.
//
//   prediction = start + slope × x
//   error      = average of (prediction − actual)²

export interface Point {
  x: number;
  y: number;
}

export interface LineModel {
  start: number;
  slope: number;
}

export const predict = (m: LineModel, x: number): number => m.start + m.slope * x;

/** Mean squared error: square each miss, then average. */
export function meanSquaredError(m: LineModel, data: readonly Point[]): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (const p of data) {
    const miss = predict(m, p.x) - p.y;
    sum += miss * miss;
  }
  return sum / data.length;
}

/** Which way, and how steeply, the error rises for each number. */
export function gradient(m: LineModel, data: readonly Point[]): LineModel {
  let dStart = 0;
  let dSlope = 0;
  for (const p of data) {
    const miss = predict(m, p.x) - p.y;
    dStart += 2 * miss;
    dSlope += 2 * miss * p.x;
  }
  const n = Math.max(1, data.length);
  return { start: dStart / n, slope: dSlope / n };
}

/** One learning step: nudge both numbers a little downhill. Returns the nudges taken. */
export function step(m: LineModel, data: readonly Point[], rate: number): LineModel {
  const g = gradient(m, data);
  const nudge = { start: -rate * g.start, slope: -rate * g.slope };
  m.start += nudge.start;
  m.slope += nudge.slope;
  return nudge;
}

/** The exact best line (least squares), used to check that learning got there. */
export function bestFit(data: readonly Point[]): LineModel {
  const n = data.length;
  const mx = data.reduce((s, p) => s + p.x, 0) / n;
  const my = data.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of data) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) * (p.x - mx);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { start: my - slope * mx, slope };
}

// The same idea with any number of inputs: one weight per input, plus the start.
//
//   prediction = start + w₁ × x₁ + w₂ × x₂ + …
//
// With two inputs the model is a tilted plane instead of a line.

export interface Sample {
  x: readonly number[];
  y: number;
}

export interface MultiModel {
  start: number;
  weights: number[];
}

export function predictMany(m: MultiModel, x: readonly number[]): number {
  let v = m.start;
  for (let i = 0; i < m.weights.length; i++) v += m.weights[i] * x[i];
  return v;
}

export function meanSquaredErrorMany(m: MultiModel, data: readonly Sample[]): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (const p of data) {
    const miss = predictMany(m, p.x) - p.y;
    sum += miss * miss;
  }
  return sum / data.length;
}

/** One learning step for every number at once. Returns the size of the largest nudge. */
export function stepMany(m: MultiModel, data: readonly Sample[], rate: number): number {
  const n = Math.max(1, data.length);
  let dStart = 0;
  const dW = m.weights.map(() => 0);
  for (const p of data) {
    const miss = predictMany(m, p.x) - p.y;
    dStart += 2 * miss;
    for (let i = 0; i < dW.length; i++) dW[i] += 2 * miss * p.x[i];
  }
  let largest = Math.abs((rate * dStart) / n);
  m.start -= (rate * dStart) / n;
  for (let i = 0; i < dW.length; i++) {
    const nudge = (rate * dW[i]) / n;
    m.weights[i] -= nudge;
    largest = Math.max(largest, Math.abs(nudge));
  }
  return largest;
}
