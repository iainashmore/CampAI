import type { Scene } from '../deck';
import { C, clamp, easeOut, fmt, lerp, type Gfx } from '../gfx';
import { COMPANY, CUSTOMERS, LOST_MEMBER_COST, NEW_MEMBER, OFFER_COST } from '../data';
import type { MultiModel } from '../ml/linear';
import { chance, logLoss, outcomes, riskScore, stepLogistic, unsquash, type Labelled, type Outcomes } from '../ml/logistic';

export const CHURN_DATA: readonly Labelled[] = CUSTOMERS.map((c) => ({ x: [c.months, c.satisfaction], yes: c.cancelled }));
export const CHURN_RATE = 0.03;
/** Learning runs this many steps in total, then stops: the panel numbers are then final. */
export const CHURN_STEPS = 3000;

/** The first rule a person might write: flag anyone whose satisfaction is under 5. */
export const churnStart = (): MultiModel => ({ start: 5, weights: [0, -1] });

export function trainedChurnModel(): MultiModel {
  const m = churnStart();
  for (let i = 0; i < CHURN_STEPS; i++) stepLogistic(m, CHURN_DATA, CHURN_RATE);
  return m;
}

export const mistakeCost = (o: Outcomes): number => o.missed * LOST_MEMBER_COST + o.falseAlarms * OFFER_COST;

const BEST_CUTOFF = 0.25;
const CUTOFF_MIN = 0.05;
const CUTOFF_MAX = 0.6;

// Chart: months as a member across, satisfaction up.
const CX0 = 170;
const CX1 = 1200;
const CY0 = 250;
const CY1 = 900;
const MMAX = 24;
const SMAX = 10;
const sx = (m: number) => CX0 + (m / MMAX) * (CX1 - CX0);
const sy = (s: number) => CY1 - (s / SMAX) * (CY1 - CY0);

// Right-hand panel.
const PX = 1270;
const PW = 580;
const PT = 240;
const PL = PX + 40;
const PR = PX + PW - 40;

// Cost chart inside the panel (step 4), also the drag target for the cutoff.
const KX0 = PL;
const KX1 = PR;
const KY0 = PT + 520;
const KY1 = PT + 640;

const pct = (p: number) => `${Math.round(p * 100)}%`;
const money = (v: number) => `$${v.toLocaleString('en-US')}`;

export class ChurnScene implements Scene {
  id = 'churn';
  name = 'Who will cancel?';
  steps = [
    {
      title: 'Who will cancel?',
      caption: 'Forty past members: how long they had been with us, and their last satisfaction score.',
      notes: `${COMPANY} loses money every time a member cancels. If we could spot them early, we could send a "please stay" offer.\n\nEach dot is a past member. Across: months with us. Up: their last satisfaction score. Filled red dots cancelled within three months; blue rings stayed.\n\nThe question for an AI model: given these two numbers for someone new, will they cancel? Yes or no. That is classification.`,
    },
    {
      title: 'A first rule',
      caption: 'Flag anyone whose satisfaction is under 5. White rings are its mistakes.',
      notes:
        'A sensible human rule: unhappy members cancel. Flag anyone scoring under 5. The gold line is the rule; everything below it gets flagged.\n\nIt makes 11 mistakes out of 40. Look at the bottom right: long-time members who score low but stay anyway. And top left: new members who seemed happy but left.\n\nThe panel shows the rule as an AI model: a risk score from the two numbers, squashed into a chance between 0% and 100%.',
    },
    {
      title: 'Learning the boundary',
      caption: 'Each step nudges the three numbers to make the AI model less surprised by what really happened.',
      notes:
        'Same learning as the forecast: nudge each number downhill. The difference is the error score. For yes/no answers it measures surprise: being confidently wrong costs a lot.\n\nWatch the line tilt. The AI model discovers that time matters too: new members cancel more easily than loyal ones at the same satisfaction. Nobody told it that.\n\nMistakes fall from 11 to 7. The shading is its chance of cancelling for every possible member.',
    },
    {
      title: 'Two kinds of mistake',
      caption: `Missing a member who cancels costs ${money(LOST_MEMBER_COST)}. An offer to someone who would have stayed wastes ${money(OFFER_COST)}.`,
      notes: `Not all mistakes cost the same. A missed canceller loses a year of boxes, ${money(LOST_MEMBER_COST)}. A wasted offer costs ${money(OFFER_COST)} of free coffee.\n\nAt the usual 50% cutoff we miss 4 cancellers. Lowering the cutoff catches more of them, at the price of more wasted offers. Watch the cost of mistakes fall, then rise again.\n\nThe cheapest cutoff here is 25%, not 50%. The AI model did not change at all: this is a business decision about where to draw the line. You can drag on the cost chart to try other cutoffs.`,
    },
    {
      title: 'Scoring a new member',
      caption: `${NEW_MEMBER.name} joined ${NEW_MEMBER.months} months ago and scored ${NEW_MEMBER.satisfaction} for satisfaction. Should we send an offer?`,
      notes: `Here is the whole AI model at work on one new member, with nothing hidden. Three numbers make a risk score, the squash turns it into a chance, and the cutoff makes the call.\n\n${NEW_MEMBER.name} has a 38% chance of cancelling. At 50% we would do nothing. At our 25% cutoff we send the offer, because missing ${NEW_MEMBER.name} would cost more than three times as much as the offer.`,
    },
  ];

  private stepIndex = 0;
  private stepT = 0;
  private model: MultiModel = churnStart();
  private learnSteps = 0;
  private carry = 0;
  private cutoff = 0.5;
  private manualCutoff = false;
  private dragging = false;
  private readonly trained = trainedChurnModel();

  enter(s: number, from: number | null): void {
    this.stepIndex = s;
    this.stepT = 0;
    this.dragging = false;
    if (s <= 1 || (s === 2 && (from === null || from < 2))) {
      this.model = churnStart();
      this.learnSteps = 0;
      this.carry = 0;
    } else if (s >= 3) {
      this.model = { start: this.trained.start, weights: [...this.trained.weights] };
      this.learnSteps = CHURN_STEPS;
    }
    if (s <= 2) this.cutoff = 0.5;
    if (s === 3) this.manualCutoff = false;
    if (s === 4) this.cutoff = BEST_CUTOFF;
  }

  update(dt: number): void {
    this.stepT += dt;
    const s = this.stepIndex;
    if (s === 2 && this.stepT > 0.8 && this.learnSteps < CHURN_STEPS) {
      // Slow enough to watch the line tilt, then fast-forward through the fine-tuning.
      this.carry += dt * (this.learnSteps < 250 ? 45 : 600);
      const n = Math.min(Math.floor(this.carry), CHURN_STEPS - this.learnSteps);
      this.carry -= n;
      for (let i = 0; i < n; i++) stepLogistic(this.model, CHURN_DATA, CHURN_RATE);
      this.learnSteps += n;
    }
    if (s === 3 && !this.manualCutoff) {
      // Sweep the cutoff all the way down, then settle on the cheapest one.
      const t = this.stepT;
      if (t < 1) this.cutoff = 0.5;
      else if (t < 5) this.cutoff = lerp(0.5, CUTOFF_MIN, smooth((t - 1) / 4));
      else if (t < 5.6) this.cutoff = CUTOFF_MIN;
      else this.cutoff = lerp(CUTOFF_MIN, BEST_CUTOFF, smooth((t - 5.6) / 1.8));
    }
  }

  pointerDown(x: number, y: number): void {
    if (this.stepIndex !== 3 || x < KX0 - 20 || x > KX1 + 20 || y < KY0 - 30 || y > KY1 + 30) return;
    this.dragging = true;
    this.manualCutoff = true;
    this.pointerMove(x);
  }

  pointerMove(x: number): void {
    if (!this.dragging) return;
    const c = CUTOFF_MIN + ((x - KX0) / (KX1 - KX0)) * (CUTOFF_MAX - CUTOFF_MIN);
    this.cutoff = Math.round(clamp(c, CUTOFF_MIN, CUTOFF_MAX) * 100) / 100;
  }

  pointerUp(): void {
    this.dragging = false;
  }

  draw(g: Gfx): void {
    const s = this.stepIndex;
    if (s >= 1) this.drawShading(g, s === 1 ? easeOut(this.stepT / 0.8) : 1);
    this.drawAxes(g);
    if (s >= 1) this.drawBoundary(g, s === 1 ? easeOut(this.stepT / 0.6) : 1);
    this.drawMembers(g);
    if (s === 4) this.drawNewMember(g);

    g.panel(PX, PT, PW, 690);
    if (s === 0) this.drawLegend(g);
    else if (s <= 2) this.drawModel(g);
    else if (s === 3) this.drawCosts(g);
    else this.drawSum(g);
  }

  // ---- chart ----

  private drawShading(g: Gfx, a: number): void {
    const ctx = g.ctx;
    const cols = 48;
    const rows = 26;
    const w = (CX1 - CX0) / cols;
    const h = (CY1 - CY0) / rows;
    ctx.save();
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const m = ((i + 0.5) / cols) * MMAX;
        const sat = ((j + 0.5) / rows) * SMAX;
        const p = chance(this.model, [m, sat]);
        const flagged = p >= this.cutoff;
        // Strength grows with how sure the AI model is, measured from the cutoff.
        const sure = flagged ? (p - this.cutoff) / (1 - this.cutoff) : (this.cutoff - p) / this.cutoff;
        ctx.fillStyle = flagged ? `rgba(255, 90, 110, ${(0.06 + 0.22 * sure) * a})` : `rgba(62, 230, 255, ${(0.03 + 0.12 * sure) * a})`;
        ctx.fillRect(CX0 + i * w, CY1 - (j + 1) * h, w + 0.5, h + 0.5);
      }
    }
    ctx.restore();
  }

  private drawAxes(g: Gfx): void {
    for (let v = 0; v <= SMAX; v += 2) {
      g.line(CX0, sy(v), CX1, sy(v), C.grid, 1.5);
      g.text(String(v), CX0 - 18, sy(v) + 9, { size: 26, color: C.dim, align: 'right', mono: true });
    }
    for (let m = 0; m <= MMAX; m += 4) {
      g.line(sx(m), CY0, sx(m), CY1, C.grid, 1.5);
      g.text(String(m), sx(m), CY1 + 40, { size: 26, color: C.dim, align: 'center', mono: true });
    }
    g.line(CX0, CY1, CX1, CY1, C.axis, 2);
    g.line(CX0, CY0, CX0, CY1, C.axis, 2);
    g.text('Months as a member', (CX0 + CX1) / 2, CY1 + 88, { size: 30, weight: 600, align: 'center' });
    const ctx = g.ctx;
    ctx.save();
    ctx.translate(CX0 - 80, (CY0 + CY1) / 2);
    ctx.rotate(-Math.PI / 2);
    g.text('Satisfaction score', 0, 0, { size: 30, weight: 600, align: 'center' });
    ctx.restore();
  }

  /** The line where the chance of cancelling equals the cutoff. */
  private drawBoundary(g: Gfx, a: number): void {
    const z = unsquash(this.cutoff);
    const [wm, ws] = this.model.weights;
    if (Math.abs(ws) < 1e-6) return;
    const satAt = (m: number) => (z - this.model.start - wm * m) / ws;
    const ctx = g.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(CX0, CY0, CX1 - CX0, CY1 - CY0);
    ctx.clip();
    g.glowLine(sx(0), sy(satAt(0)), sx(MMAX), sy(satAt(MMAX)), C.gold, 5, 22, a);
    ctx.restore();
    // Label near where the line leaves the chart.
    let end = MMAX;
    if (Math.abs(wm) > 1e-6) {
      for (const edge of [0, SMAX]) {
        const m = (z - this.model.start - ws * edge) / wm;
        if (m > 2 && m < end) end = m;
      }
    }
    // Below the line and to the left of the point, where the falling line leaves room.
    const lm = end - 3;
    g.text(`${pct(this.cutoff)} chance`, sx(lm), clamp(sy(satAt(lm)) + 46, CY0 + 40, CY1 - 12), {
      size: 24,
      weight: 700,
      color: C.gold,
      align: 'right',
      alpha: a,
    });
  }

  private drawMembers(g: Gfx): void {
    const s = this.stepIndex;
    const pulse = 0.6 + 0.4 * Math.sin(this.stepT * 5);
    CHURN_DATA.forEach((d, i) => {
      const t = s === 0 ? easeOut((this.stepT - 0.3 - i * 0.05) / 0.35) : 1;
      if (t <= 0) return;
      const x = sx(d.x[0]);
      const y = sy(d.x[1]);
      if (s >= 1) {
        const flagged = chance(this.model, d.x) >= this.cutoff;
        if (flagged !== d.yes) {
          const ctx = g.ctx;
          ctx.save();
          ctx.strokeStyle = `rgba(255,255,255,${0.85 * pulse})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, 19, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (d.yes) g.dot(x, y, 10 * t, C.red, 16);
      else ring(g, x, y, 9 * t, C.cyan);
    });
  }

  private drawNewMember(g: Gfx): void {
    const a = easeOut(this.stepT / 0.6);
    const x = sx(NEW_MEMBER.months);
    const y = sy(NEW_MEMBER.satisfaction);
    g.dot(x, y, 14 + 4 * Math.sin(this.stepT * 4), C.gold, 30, a);
    g.text(NEW_MEMBER.name, x - 28, y + 12, { size: 32, weight: 700, color: C.gold, align: 'right', alpha: a });
  }

  // ---- panel ----

  private drawLegend(g: Gfx): void {
    const a = easeOut((this.stepT - 0.2) / 0.6);
    const cancelled = CHURN_DATA.filter((d) => d.yes).length;
    g.text('PAST MEMBERS', PL, PT + 52, { size: 24, color: C.cyan, weight: 700, alpha: a });
    g.dot(PL + 14, PT + 128, 10, C.red, 16, a);
    g.text('cancelled', PL + 48, PT + 138, { size: 32, alpha: a });
    g.text(String(cancelled), PR, PT + 138, { size: 40, mono: true, weight: 700, align: 'right', color: C.red, alpha: a });
    ring(g, PL + 14, PT + 208, 9, C.cyan, a);
    g.text('stayed', PL + 48, PT + 218, { size: 32, alpha: a });
    g.text(String(CHURN_DATA.length - cancelled), PR, PT + 218, { size: 40, mono: true, weight: 700, align: 'right', color: C.cyan, alpha: a });
    g.line(PR - 120, PT + 250, PR, PT + 250, C.text, 2);
    g.text('members', PL + 48, PT + 298, { size: 32, color: C.dim, alpha: a });
    g.text(String(CHURN_DATA.length), PR, PT + 298, { size: 40, mono: true, weight: 700, align: 'right', alpha: a });
    g.text('Cancelled = left within three months', PL, PT + 400, { size: 24, color: C.dim, alpha: a });
    g.text('of their satisfaction survey.', PL, PT + 432, { size: 24, color: C.dim, alpha: a });
  }

  private drawFormula(g: Gfx, top: number): void {
    g.text('THE AI MODEL', PL, top, { size: 24, color: C.cyan, weight: 700 });
    g.text('risk score = start', PL, top + 42, { size: 25, weight: 600 });
    g.text('+ month slope × months', PL + 26, top + 74, { size: 25, weight: 600 });
    g.text('+ satisfaction slope × satisfaction', PL + 26, top + 106, { size: 25, weight: 600 });
    g.text('chance = squash(risk score)', PL, top + 142, { size: 25, weight: 600, color: C.gold });
  }

  private drawModel(g: Gfx): void {
    const a = this.stepIndex === 1 ? easeOut(this.stepT / 0.6) : 1;
    g.ctx.save();
    g.ctx.globalAlpha = a;
    this.drawFormula(g, PT + 52);
    const m = this.model;
    const rows: [string, number][] = [
      ['start', m.start],
      ['month slope', m.weights[0]],
      ['satisfaction slope', m.weights[1]],
    ];
    rows.forEach(([name, v], i) => {
      const y = PT + 252 + i * 46;
      g.text(name, PL, y, { size: 26 });
      g.text(fmt(v, 2), PR, y, { size: 32, mono: true, weight: 700, align: 'right', color: C.cyan, glow: 8 });
    });
    const o = outcomes(m, CHURN_DATA, this.cutoff);
    this.drawOutcomeTable(g, PT + 420, o);
    g.text(`mistakes ${o.missed + o.falseAlarms}`, PL, PT + 640, { size: 28, weight: 700, color: C.text });
    g.text(`error score ${fmt(logLoss(m, CHURN_DATA), 2)}`, PR, PT + 640, { size: 24, color: C.red, align: 'right', mono: true });
    if (this.stepIndex === 2) {
      g.text(`learning step ${Math.min(this.learnSteps, CHURN_STEPS)}`, PL, PT + 672, { size: 21, color: C.gold, weight: 600 });
    }
    g.ctx.restore();
  }

  /** Flagged / not flagged against what really happened, laid out as a small table. */
  private drawOutcomeTable(g: Gfx, top: number, o: Outcomes): void {
    const c1 = PL + 300;
    const c2 = PR;
    g.text('really cancelled', c1, top, { size: 19, color: C.dim, align: 'right' });
    g.text('really stayed', c2, top, { size: 19, color: C.dim, align: 'right' });
    g.line(PL, top + 12, PR, top + 12, C.panelEdge, 2);
    const row = (label: string, y: number, l: [string, number, string], r: [string, number, string]) => {
      g.text(label, PL, y, { size: 22, color: C.dim });
      g.text(String(l[1]), c1, y, { size: 32, mono: true, weight: 700, align: 'right', color: l[2] });
      g.text(l[0], c1, y + 26, { size: 18, color: C.faint, align: 'right' });
      g.text(String(r[1]), c2, y, { size: 32, mono: true, weight: 700, align: 'right', color: r[2] });
      g.text(r[0], c2, y + 26, { size: 18, color: C.faint, align: 'right' });
    };
    row('flagged', top + 56, ['caught', o.caught, C.green], ['wasted offer', o.falseAlarms, C.red]);
    row('not flagged', top + 132, ['missed', o.missed, C.red], ['left alone', o.leftAlone, C.green]);
  }

  private drawCosts(g: Gfx): void {
    const o = outcomes(this.model, CHURN_DATA, this.cutoff);
    g.text('CUTOFF', PL, PT + 52, { size: 24, color: C.gold, weight: 700 });
    g.text(`flag if chance ≥ ${pct(this.cutoff)}`, PL, PT + 100, { size: 34, weight: 700, color: C.gold, glow: 10 });
    this.drawOutcomeTable(g, PT + 150, o);

    // Worksheet: each kind of mistake times its cost, then the total.
    const top = PT + 350;
    const lines: [string, number, number][] = [
      ['missed members', o.missed, LOST_MEMBER_COST],
      ['wasted offers', o.falseAlarms, OFFER_COST],
    ];
    lines.forEach(([label, n, each], i) => {
      const y = top + i * 40;
      g.text(label, PL, y, { size: 22, color: C.dim });
      g.text(`${n} × ${money(each)} = ${money(n * each)}`, PR, y, { size: 26, mono: true, align: 'right' });
    });
    g.line(PR - 200, top + 62, PR, top + 62, C.text, 2);
    g.text('cost of mistakes', PL, top + 100, { size: 22, color: C.dim });
    g.text(money(mistakeCost(o)), PR, top + 100, { size: 34, mono: true, weight: 700, align: 'right', color: C.red, glow: 10 });

    this.drawCostCurve(g);
  }

  /** Cost of mistakes for every cutoff, with the current one marked. Drag along it. */
  private drawCostCurve(g: Gfx): void {
    const pts: { c: number; cost: number }[] = [];
    for (let c = CUTOFF_MIN; c <= CUTOFF_MAX + 1e-9; c += 0.01) pts.push({ c, cost: mistakeCost(outcomes(this.model, CHURN_DATA, c)) });
    const max = Math.max(...pts.map((p) => p.cost));
    const X = (c: number) => KX0 + ((c - CUTOFF_MIN) / (CUTOFF_MAX - CUTOFF_MIN)) * (KX1 - KX0);
    const Y = (v: number) => KY1 - (v / max) * (KY1 - KY0);
    g.line(KX0, KY1, KX1, KY1, C.axis, 1.5);
    const ctx = g.ctx;
    ctx.save();
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((p, i) => {
      // Cost is a step function: it only changes when a member crosses the cutoff.
      if (i === 0) ctx.moveTo(X(p.c), Y(p.cost));
      else {
        ctx.lineTo(X(p.c), Y(pts[i - 1].cost));
        ctx.lineTo(X(p.c), Y(p.cost));
      }
    });
    ctx.stroke();
    ctx.restore();
    const cur = mistakeCost(outcomes(this.model, CHURN_DATA, this.cutoff));
    g.line(X(this.cutoff), KY0 - 10, X(this.cutoff), KY1, 'rgba(255,201,74,0.6)', 2, [5, 5]);
    g.dot(X(this.cutoff), Y(cur), 9, C.gold, 18);
    for (const c of [0.1, 0.25, 0.5]) g.text(pct(c), X(c), KY1 + 26, { size: 18, color: C.dim, align: 'center', mono: true });
    g.text('cost of mistakes at each cutoff · drag to try', PL, KY0 - 22, { size: 18, color: C.faint });
  }

  /** Step 5: the whole AI model as a worked sum for one new member. */
  private drawSum(g: Gfx): void {
    const a = easeOut(this.stepT / 0.6);
    const m = this.model;
    const x = [NEW_MEMBER.months, NEW_MEMBER.satisfaction];
    const z = riskScore(m, x);
    const p = chance(m, x);
    // The sum adds the numbers exactly as shown (2 decimals), so the column adds up on screen.
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const shownZ = r2(m.start) + r2(m.weights[0] * x[0]) + r2(m.weights[1] * x[1]);
    g.ctx.save();
    g.ctx.globalAlpha = a;
    g.text(`SCORING ${NEW_MEMBER.name.toUpperCase()}`, PL, PT + 52, { size: 24, color: C.gold, weight: 700 });

    const rows: [string, string][] = [
      ['start', fmt(m.start, 2)],
      [`month slope × ${NEW_MEMBER.months} months`, `${signed(m.weights[0])} × ${NEW_MEMBER.months} = ${signed(m.weights[0] * x[0])}`],
      [`satisfaction slope × ${NEW_MEMBER.satisfaction}`, `${signed(m.weights[1])} × ${NEW_MEMBER.satisfaction} = ${signed(m.weights[1] * x[1])}`],
    ];
    rows.forEach(([label, sum], i) => {
      const y = PT + 110 + i * 62;
      g.text(sum, PR, y, { size: 26, mono: true, align: 'right' });
      g.text(label, PR, y + 24, { size: 18, color: C.faint, align: 'right' });
    });
    g.line(PR - 200, PT + 288, PR, PT + 288, C.text, 2);
    g.text('risk score', PL, PT + 326, { size: 22, color: C.dim });
    g.text(signed(shownZ), PR, PT + 326, { size: 32, mono: true, weight: 700, align: 'right' });

    this.drawSquash(g, z, p);

    g.text('chance of cancelling', PL, PT + 580, { size: 22, color: C.dim });
    g.text(pct(p), PR, PT + 580, { size: 40, mono: true, weight: 700, align: 'right', color: C.gold, glow: 12 });
    const send = p >= this.cutoff;
    g.text(`${pct(p)} ${send ? '≥' : '<'} ${pct(this.cutoff)} cutoff`, PL, PT + 640, { size: 24, color: C.dim });
    g.text(send ? 'send the offer' : 'leave alone', PR, PT + 640, { size: 28, weight: 700, align: 'right', color: send ? C.green : C.cyan });
    g.ctx.restore();
  }

  /** The squash curve: any risk score in, a chance between 0% and 100% out. */
  private drawSquash(g: Gfx, z: number, p: number): void {
    const x0 = PL + 56;
    const x1 = PR;
    const y0 = PT + 370;
    const y1 = PT + 520;
    const X = (v: number) => x0 + ((v + 6) / 12) * (x1 - x0);
    const Y = (v: number) => y1 - v * (y1 - y0);
    g.line(x0, y1, x1, y1, C.axis, 1.5);
    g.line(X(0), y0, X(0), y1, C.grid, 1.5);
    const ctx = g.ctx;
    ctx.save();
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let v = -6; v <= 6.001; v += 0.1) {
      const py = Y(1 / (1 + Math.exp(-v)));
      if (v === -6) ctx.moveTo(X(v), py);
      else ctx.lineTo(X(v), py);
    }
    ctx.stroke();
    ctx.restore();
    g.line(X(z), y1, X(z), Y(p), 'rgba(255,201,74,0.7)', 2, [5, 5]);
    g.line(x0, Y(p), X(z), Y(p), 'rgba(255,201,74,0.7)', 2, [5, 5]);
    g.dot(X(z), Y(p), 8, C.gold, 16);
    g.text('squash: risk score in, chance out', x0, y0 - 16, { size: 18, color: C.faint });
    g.text('100%', x0 - 10, y0 + 12, { size: 18, color: C.faint, align: 'right' });
    g.text('0%', x0 - 10, y1 + 6, { size: 18, color: C.faint, align: 'right' });
  }
}

function ring(g: Gfx, x: number, y: number, r: number, color: string, alpha = 1): void {
  const ctx = g.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

const smooth = (t: number): number => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

const signed = (v: number): string => (v < 0 ? `−${fmt(-v, 2)}` : fmt(v, 2));
