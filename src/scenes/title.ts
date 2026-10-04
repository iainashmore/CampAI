import type { Scene } from '../deck';
import { C, H, W, easeOut, type Gfx } from '../gfx';
import { COMPANY } from '../data';

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Opening card: the title, the company, and a slow drifting network behind them. */
export class TitleScene implements Scene {
  id = 'title';
  name = 'Welcome';
  ownHeadline = true;
  steps = [
    {
      title: 'How machines learn',
      notes:
        'Welcome. No slides today: every picture you see is a real piece of machine learning running live on this laptop, with no internet and no AI service behind it.\n\nThe numbers are small on purpose, so you can follow every one of them.',
    },
    {
      title: `Meet ${COMPANY}`,
      caption: 'A coffee subscription company. Every scene today uses its data.',
      notes: `${COMPANY} sells coffee by subscription. We will follow its customers all session: forecasting sign-ups, spotting who might cancel, reading support emails, finding customer groups and choosing offers.\n\nNext: the simplest AI model there is, a straight line.`,
    },
  ];

  private t = 0;
  private stepT = 0;
  private step = 0;
  private motes: Mote[] = [];

  constructor() {
    // Fixed seed so the backdrop looks the same at every rehearsal.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      this.motes.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 18, vy: (rnd() - 0.5) * 18 });
    }
  }

  enter(step: number): void {
    this.step = step;
    this.stepT = 0;
  }

  update(dt: number): void {
    this.t += dt;
    this.stepT += dt;
    for (const m of this.motes) {
      m.x = (m.x + m.vx * dt + W) % W;
      m.y = (m.y + m.vy * dt + H) % H;
    }
  }

  draw(g: Gfx): void {
    const { ctx } = g;
    ctx.save();
    for (let i = 0; i < this.motes.length; i++) {
      const a = this.motes[i];
      for (let j = i + 1; j < this.motes.length; j++) {
        const b = this.motes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 190) g.line(a.x, a.y, b.x, b.y, `rgba(62, 230, 255, ${0.16 * (1 - d / 190)})`, 1.5);
      }
    }
    for (const m of this.motes) g.dot(m.x, m.y, 3, C.cyan, 10, 0.5);
    ctx.restore();

    const a = easeOut(this.stepT / 0.8);
    if (this.step === 0) {
      g.text('CampAI', W / 2, 430, { size: 64, weight: 700, color: C.cyan, align: 'center', glow: 30, alpha: a });
      g.text('How machines learn', W / 2, 560, { size: 120, weight: 800, align: 'center', glow: 20, alpha: a });
      g.text('Live, step by step, with real numbers', W / 2, 650, { size: 40, color: C.dim, align: 'center', alpha: a });
    } else {
      g.text(COMPANY, W / 2, 500, { size: 130, weight: 800, color: C.gold, align: 'center', glow: 30, alpha: a });
      g.text('A coffee subscription company', W / 2, 590, { size: 44, color: C.text, align: 'center', alpha: a });
      g.text('Every scene today uses its customers and its data', W / 2, 660, { size: 36, color: C.dim, align: 'center', alpha: a });
    }
  }
}
