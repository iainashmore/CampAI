import type { Scene } from '../deck';
import { C, clamp, easeOut, fmt, type Gfx } from '../gfx';
import { AD_WEEKS, ACTUAL_NEXT_WEEK, COMPANY, PLANNED_SPEND } from '../data';
import { gradient, meanSquaredError, predict, step, type LineModel, type Point } from '../ml/linear';

/** The first guess shown on screen: a flat 100 sign-ups whatever we spend. */
export const FORECAST_START: Readonly<LineModel> = { start: 100, slope: 0 };
/** Learning rate: how big each nudge is. Chosen so the line settles in about eight seconds. */
export const FORECAST_RATE = 0.04;
const STEPS_PER_SECOND = 75;

// Chart area on the 1920×1080 stage, and the data range it shows.
const CX0 = 170;
const CX1 = 1200;
const CY0 = 250;
const CY1 = 900;
const XMAX = 8;
const YMAX = 200;
const sx = (x: number) => CX0 + (x / XMAX) * (CX1 - CX0);
const sy = (y: number) => CY1 - (y / YMAX) * (CY1 - CY0);

// Model panel on the right.
const PX = 1270;
const PW = 580;

export class ForecastScene implements Scene {
  id = 'forecast';
  name = 'Forecast sign-ups';
  steps = [
    {
      title: 'Twelve weeks of ads',
      caption: 'Each dot is one week: what we spent on ads, and how many new subscribers signed up.',
      notes:
        `${COMPANY} wants to know: if we spend more on ads, how many more people sign up?\n\nHere are twelve real weeks. Left to right is ad spend, bottom to top is new subscribers. More spend, more sign-ups, but it is noisy: no week sits exactly on a pattern.`,
    },
    {
      title: 'A first guess',
      caption: 'Guess: 100 sign-ups every week, whatever we spend. The red sticks are its misses.',
      notes:
        'Every AI model starts as a guess. This one is a straight line described by just two numbers: where it starts (sign-ups with no ads) and its slope (extra sign-ups per $1k).\n\nThe first guess is flat. The red sticks show how far it misses each week. The AI model squares each miss (the faint squares), so big misses count far more, and averages them into one error score: 685.',
    },
    {
      title: 'Learning: nudge, check, repeat',
      caption: 'Each step nudges both numbers a little in the direction that shrinks the error.',
      notes:
        'This is all "learning" means. Work out which way each number should move to make the error smaller, nudge it a little, and repeat. The chart bottom right is the error falling with every step.\n\nNothing here was told the answer. It found the line by itself, hundreds of tiny nudges. The same idea, at a much bigger scale, trains every neural network.\n\nTry it: click anywhere on the chart to add a week and watch the line re-learn.',
    },
    {
      title: 'The forecast',
      caption: `Next week we plan $${PLANNED_SPEND}k of ads. The AI model is just two numbers, so we can work it out by hand.`,
      notes:
        'The finished AI model is the two numbers it learned. To forecast, read the line at $7k, or do the sum: start plus slope times spend.\n\nThis is why simple models are loved in business: anyone can check the arithmetic.',
    },
    {
      title: 'Close, not perfect',
      caption: 'What really happened next week.',
      notes:
        'Next week actually brought 160 sign-ups. The forecast was off by about five. That is a good forecast: no AI model is perfect, because the world is noisy.\n\nThe honest question is never "is it right?" but "how wrong is it, usually?" The typical miss on the panel answers that.',
    },
  ];

  private stepIndex = 0;
  private stepT = 0;
  private model: LineModel = { ...FORECAST_START };
  private extra: Point[] = [];
  private learnSteps = 0;
  private stepCarry = 0;
  private history: number[] = [];
  private lastNudge: LineModel = { start: 0, slope: 0 };

  private get data(): Point[] {
    return [...AD_WEEKS, ...this.extra];
  }

  private reset(): void {
    this.model = { ...FORECAST_START };
    this.learnSteps = 0;
    this.stepCarry = 0;
    this.lastNudge = { start: 0, slope: 0 };
    this.history = [meanSquaredError(this.model, this.data)];
  }

  private learn(n: number): void {
    const data = this.data;
    for (let i = 0; i < n; i++) {
      const g = gradient(this.model, data);
      // Stop counting once the nudges are too small to see; the line has settled.
      if (Math.abs(g.start) < 0.02 && Math.abs(g.slope) < 0.02) break;
      this.lastNudge = step(this.model, data, FORECAST_RATE);
      this.learnSteps++;
      this.history.push(meanSquaredError(this.model, data));
    }
    if (this.history.length > 2000) this.history.splice(1, this.history.length - 2000);
  }

  enter(s: number, from: number | null): void {
    this.stepIndex = s;
    this.stepT = 0;
    if (s <= 1) {
      this.extra = [];
      this.reset();
    } else if (s === 2 && (from === null || from < 2)) {
      this.reset();
    } else if (s >= 3) {
      if (from === null) this.reset();
      this.learn(5000);
    }
  }

  update(dt: number): void {
    this.stepT += dt;
    if (this.stepIndex >= 2) {
      this.stepCarry += dt * STEPS_PER_SECOND;
      const n = Math.floor(this.stepCarry);
      this.stepCarry -= n;
      if (this.stepIndex === 2 && this.stepT < 0.8) return; // let the headline land first
      this.learn(n);
    }
  }

  pointerDown(x: number, y: number): void {
    if (this.stepIndex < 2 || x < CX0 || x > CX1 || y < CY0 || y > CY1) return;
    const px = clamp(((x - CX0) / (CX1 - CX0)) * XMAX, 0, XMAX);
    const py = clamp(((CY1 - y) / (CY1 - CY0)) * YMAX, 0, YMAX);
    this.extra.push({ x: Math.round(px * 10) / 10, y: Math.round(py) });
    this.history.push(meanSquaredError(this.model, this.data));
  }

  draw(g: Gfx): void {
    this.drawAxes(g);
    const s = this.stepIndex;
    const data = this.data;

    // Misses: a red stick from each dot to the line, and its square (area = squared miss).
    if (s >= 1) {
      const a = s === 1 ? easeOut(this.stepT / 0.6) : 0.9;
      const squares = s === 1 ? easeOut((this.stepT - 0.8) / 0.8) * 0.22 : 0.07;
      for (const p of data) {
        const lineY = predict(this.model, p.x);
        const y0 = sy(p.y);
        const y1 = sy(clamp(lineY, 0, YMAX));
        const side = Math.abs(y1 - y0);
        if (squares > 0.01) {
          g.ctx.save();
          g.ctx.fillStyle = `rgba(255, 90, 110, ${squares})`;
          g.ctx.fillRect(sx(p.x), Math.min(y0, y1), side, side);
          g.ctx.restore();
        }
        g.glowLine(sx(p.x), y0, sx(p.x), y1, C.red, 3, 10, a);
      }
    }

    // The model's line.
    if (s >= 1) {
      const a = s === 1 ? easeOut(this.stepT / 0.5) : 1;
      const ctx = g.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(CX0, CY0, CX1 - CX0, CY1 - CY0);
      ctx.clip();
      g.glowLine(sx(0), sy(predict(this.model, 0)), sx(XMAX), sy(predict(this.model, XMAX)), C.cyan, 5, 24, a);
      ctx.restore();
    }

    // Data dots pop in one by one on the first step.
    AD_WEEKS.forEach((p, i) => {
      const t = s === 0 ? easeOut((this.stepT - 0.3 - i * 0.12) / 0.35) : 1;
      if (t <= 0) return;
      g.dot(sx(p.x), sy(p.y), 11 * t, C.magenta, 18);
    });
    for (const p of this.extra) g.dot(sx(p.x), sy(p.y), 11, C.gold, 18);

    if (s >= 3) this.drawForecastOnChart(g);
    if (s === 0) this.drawTable(g);
    else this.drawModelPanel(g);
  }

  private drawAxes(g: Gfx): void {
    for (let y = 0; y <= YMAX; y += 50) {
      g.line(CX0, sy(y), CX1, sy(y), C.grid, 1.5);
      g.text(String(y), CX0 - 18, sy(y) + 9, { size: 26, color: C.dim, align: 'right', mono: true });
    }
    for (let x = 0; x <= XMAX; x++) {
      g.line(sx(x), CY0, sx(x), CY1, C.grid, 1.5);
      g.text(`$${x}k`, sx(x), CY1 + 40, { size: 26, color: C.dim, align: 'center', mono: true });
    }
    g.line(CX0, CY1, CX1, CY1, C.axis, 2);
    g.line(CX0, CY0, CX0, CY1, C.axis, 2);
    g.text('Ad spend that week', (CX0 + CX1) / 2, CY1 + 88, { size: 30, color: C.text, align: 'center', weight: 600 });
    const ctx = g.ctx;
    ctx.save();
    ctx.translate(CX0 - 100, (CY0 + CY1) / 2);
    ctx.rotate(-Math.PI / 2);
    g.text('New subscribers that week', 0, 0, { size: 30, color: C.text, align: 'center', weight: 600 });
    ctx.restore();
  }

  /** Step 0: the raw data, laid out like a worksheet. */
  private drawTable(g: Gfx): void {
    const a = easeOut((this.stepT - 0.2) / 0.6);
    g.panel(PX, CY0 - 10, PW, 690, a);
    const col = [PX + 120, PX + 330, PX + 520];
    g.text('Week', col[0], CY0 + 46, { size: 26, color: C.dim, align: 'right', weight: 600, alpha: a });
    g.text('Ad spend', col[1], CY0 + 46, { size: 26, color: C.dim, align: 'right', weight: 600, alpha: a });
    g.text('Sign-ups', col[2], CY0 + 46, { size: 26, color: C.dim, align: 'right', weight: 600, alpha: a });
    g.line(PX + 40, CY0 + 64, PX + PW - 40, CY0 + 64, C.panelEdge, 2);
    AD_WEEKS.forEach((p, i) => {
      const t = easeOut((this.stepT - 0.3 - i * 0.12) / 0.35);
      const y = CY0 + 108 + i * 45;
      g.text(String(i + 1), col[0], y, { size: 28, mono: true, align: 'right', color: C.dim, alpha: t });
      g.text(`$${fmt(p.x)}k`, col[1], y, { size: 28, mono: true, align: 'right', alpha: t });
      g.text(String(p.y), col[2], y, { size: 28, mono: true, align: 'right', color: C.magenta, alpha: t });
    });
  }

  private drawModelPanel(g: Gfx): void {
    const s = this.stepIndex;
    const a = s === 1 ? easeOut(this.stepT / 0.6) : 1;
    const top = CY0 - 10;
    g.panel(PX, top, PW, 690, a);
    const L = PX + 40;
    const R = PX + PW - 40;
    g.text('THE AI MODEL', L, top + 52, { size: 24, color: C.cyan, weight: 700, alpha: a });
    g.text('sign-ups = start + slope × ad spend', L, top + 100, { size: 30, weight: 600, alpha: a });

    const mse = meanSquaredError(this.model, this.data);
    const rows: [string, string, string, string][] = [
      ['start', fmt(this.model.start), 'sign-ups with no ads at all', C.cyan],
      ['slope', fmt(this.model.slope, 2), 'extra sign-ups per $1k of ads', C.cyan],
      ['error score', fmt(mse, 0), 'average of the squared misses', C.red],
    ];
    rows.forEach(([name, value, label, color], i) => {
      const y = top + 175 + i * 92;
      g.text(name, L, y, { size: 30, color: C.text, alpha: a });
      g.text(value, R, y, { size: 40, mono: true, weight: 700, align: 'right', color, glow: 10, alpha: a });
      g.text(label, L, y + 34, { size: 22, color: C.dim, alpha: a });
    });
    g.text(`typical miss ≈ ${fmt(Math.sqrt(mse), 0)} sign-ups`, L, top + 435, { size: 26, color: C.dim, alpha: a });
    g.text('(square root of the error score)', L, top + 466, { size: 20, color: C.faint, alpha: a });

    if (s === 2) this.drawLearning(g, L, R, top + 500);
    if (s >= 3) this.drawSum(g, L, R, top + 510);
  }

  /** Step counter, the latest nudges, and the error falling step by step. */
  private drawLearning(g: Gfx, L: number, R: number, y: number): void {
    g.text(`learning step ${this.learnSteps}`, L, y + 28, { size: 24, color: C.gold, weight: 600 });
    const n = this.lastNudge;
    g.text(`nudges: start ${n.start >= 0 ? '+' : '−'}${fmt(Math.abs(n.start), 3)}, slope ${n.slope >= 0 ? '+' : '−'}${fmt(Math.abs(n.slope), 3)}`, L, y + 60, {
      size: 20,
      color: C.dim,
      mono: true,
    });
    // Error curve.
    const x0 = L;
    const x1 = R;
    const y0 = y + 80;
    const y1 = y + 160;
    g.line(x0, y1, x1, y1, C.axis, 1.5);
    const h = this.history;
    if (h.length < 2) return;
    const max = h[0] || 1;
    const ctx = g.ctx;
    ctx.save();
    ctx.strokeStyle = C.red;
    ctx.shadowColor = C.red;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const span = Math.max(600, h.length - 1);
    h.forEach((v, i) => {
      const px = x0 + (i / span) * (x1 - x0);
      const py = y1 - clamp(v / max, 0, 1.2) * (y1 - y0);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
    g.text('error score, step by step', x1, y1 + 26, { size: 18, color: C.faint, align: 'right' });
  }

  /** The forecast as a worked sum, numbers in columns with what each one is. */
  private drawSum(g: Gfx, L: number, R: number, y: number): void {
    const a = easeOut(this.stepT / 0.6);
    const m = this.model;
    const slopePart = m.slope * PLANNED_SPEND;
    const forecast = predict(m, PLANNED_SPEND);
    const rows: [string, string][] = [
      [fmt(m.start), 'start'],
      [`+ ${fmt(m.slope, 2)} × ${PLANNED_SPEND} = ${fmt(slopePart)}`, `slope × $${PLANNED_SPEND}k`],
    ];
    rows.forEach(([sum, label], i) => {
      const ry = y + 30 + i * 44;
      g.text(sum, R, ry, { size: 28, mono: true, align: 'right', alpha: a });
      g.text(label, L, ry, { size: 22, color: C.dim, alpha: a });
    });
    g.line(R - 200, y + 104, R, y + 104, C.text, 2);
    g.text(`≈ ${fmt(forecast, 0)}`, R, y + 146, { size: 38, mono: true, weight: 700, align: 'right', color: C.gold, glow: 14, alpha: a });
    g.text('forecast sign-ups', L, y + 146, { size: 22, color: C.dim, alpha: a });
  }

  private drawForecastOnChart(g: Gfx): void {
    const a = easeOut(this.stepT / 0.6);
    const f = predict(this.model, PLANNED_SPEND);
    const x = sx(PLANNED_SPEND);
    g.line(x, CY1, x, sy(f), `rgba(255, 201, 74, ${0.7 * a})`, 2, [8, 8]);
    g.line(CX0, sy(f), x, sy(f), `rgba(255, 201, 74, ${0.7 * a})`, 2, [8, 8]);
    g.dot(x, sy(f), 14, C.gold, 26, a);
    // Labels sit on the far side from the real week, so the two never overlap.
    const actualAbove = this.stepIndex >= 4 && ACTUAL_NEXT_WEEK >= f;
    const fy = actualAbove ? sy(f) + 48 : sy(f) - 24;
    g.text(`≈ ${fmt(f, 0)}`, x - 24, fy, { size: 32, weight: 700, color: C.gold, align: 'right', alpha: a });
    g.text('forecast', x - 24, actualAbove ? fy + 32 : fy - 38, { size: 22, color: C.dim, align: 'right', alpha: a });

    if (this.stepIndex >= 4) {
      const t = easeOut((this.stepT - 0.4) / 0.7);
      if (t <= 0) return;
      // The real week drops in from above.
      const ay = sy(ACTUAL_NEXT_WEEK) - (1 - t) * 300;
      g.glowLine(x, sy(f), x, ay, C.red, 3, 10, t);
      g.dot(x, ay, 13, C.green, 24, t);
      const off = Math.abs(f - ACTUAL_NEXT_WEEK);
      const ly = actualAbove ? ay - 52 : ay + 48;
      g.text(`actual ${ACTUAL_NEXT_WEEK}`, x - 26, ly, { size: 30, weight: 700, color: C.green, align: 'right', alpha: t });
      g.text(`off by ${fmt(off, 0)}`, x - 26, ly + 34, { size: 24, color: C.red, align: 'right', alpha: t });
    }
  }
}
