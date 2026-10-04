// Steps 6 and 7 of the forecast scene: a second input (emails) turns the line into a plane.
// The 2D chart swings round into a 3D box, and learning tilts the plane with three numbers.

import { C, clamp, easeOut, fmt, type Gfx } from '../gfx';
import { AD_WEEKS, EMAILS_SENT } from '../data';
import { bestFit, meanSquaredErrorMany, predictMany, stepMany, type MultiModel, type Sample } from '../ml/linear';

/** Learning rate for three numbers: smaller than the line's, because two inputs pull together. */
export const PLANE_RATE = 0.02;
const STEPS_PER_SECOND = 140;

export const PLANE_DATA: readonly Sample[] = AD_WEEKS.map((p, i) => ({ x: [p.x, EMAILS_SENT[i]], y: p.y }));

/** Where the plane starts: the ads-only line, stretched back flat across the emails axis. */
export function planeStart(): MultiModel {
  const line = bestFit(AD_WEEKS);
  return { start: line.start, weights: [line.slope, 0] };
}

const XMAX = 8; // $k of ads
const ZMAX = 8; // thousand emails
const YMAX = 200; // sign-ups

// The 2D chart rectangle this view starts from (front face of the box at yaw 0).
const CX0 = 170;
const CX1 = 1200;
const CY0 = 250;
const CY1 = 900;
const HW = (CX1 - CX0) / 2;
const HH = (CY1 - CY0) / 2;
const HD = HW;

// Final camera: turned to show depth, looking slightly down.
const YAW = 0.62;
const PITCH = 0.5;
const SCALE = 0.6;
const CENTRE_X = 610;
const CENTRE_Y = 570;

interface Projected {
  x: number;
  y: number;
  depth: number;
}

export class PlaneView {
  private sub = 0;
  private t = 0;
  private model: MultiModel = planeStart();
  private learnSteps = 0;
  private carry = 0;
  private yaw = 0;
  private pitch = 0;
  private scale = 1;
  private cx = (CX0 + CX1) / 2;
  private cy = (CY0 + CY1) / 2;
  private dragYaw = 0;
  private dragPitch = 0;
  private drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  readonly lineError = meanSquaredErrorMany(planeStart(), PLANE_DATA);

  /** sub 0 = second input appears, sub 1 = learn the plane. `fresh` when arriving from outside. */
  enter(sub: number, fresh: boolean): void {
    this.sub = sub;
    this.t = fresh && sub === 1 ? 2 : 0; // skip the swing if we jump straight to learning
    if (sub === 0 || fresh) {
      this.model = planeStart();
      this.learnSteps = 0;
      this.carry = 0;
    }
    if (fresh) {
      this.dragYaw = 0;
      this.dragPitch = 0;
    }
  }

  update(dt: number): void {
    this.t += dt;
    // Swing from the flat chart into 3D over the first 1.6 s, then sway gently.
    const k = this.sub === 0 ? easeInOut(clamp((this.t - 0.3) / 1.6, 0, 1)) : 1;
    const sway = Math.sin(this.t * 0.35) * 0.12 * k;
    this.yaw = YAW * k + sway + this.dragYaw;
    this.pitch = clamp(PITCH * k + this.dragPitch, k < 1 ? 0 : 0.1, 1.2);
    this.scale = 1 + (SCALE - 1) * k;
    this.cx = (CX0 + CX1) / 2 + (CENTRE_X - (CX0 + CX1) / 2) * k;
    this.cy = (CY0 + CY1) / 2 + (CENTRE_Y - (CY0 + CY1) / 2) * k;

    if (this.sub === 1 && this.t > 0.8) {
      this.carry += dt * STEPS_PER_SECOND;
      const n = Math.floor(this.carry);
      this.carry -= n;
      for (let i = 0; i < n; i++) {
        if (stepMany(this.model, PLANE_DATA, PLANE_RATE) < 0.0005) break;
        this.learnSteps++;
      }
    }
  }

  pointerDown(x: number, y: number): void {
    if (x > 1250) return;
    this.drag = { x, y, yaw: this.dragYaw, pitch: this.dragPitch };
  }

  pointerMove(x: number, y: number): void {
    if (!this.drag) return;
    this.dragYaw = clamp(this.drag.yaw + (x - this.drag.x) * 0.004, -0.9, 0.7);
    this.dragPitch = this.drag.pitch + (y - this.drag.y) * 0.004;
  }

  pointerUp(): void {
    this.drag = null;
  }

  /** Data values to the screen. Orthographic, so at yaw 0 it is exactly the flat 2D chart. */
  private project(spend: number, signups: number, emails: number): Projected {
    const px = (spend / XMAX) * 2 * HW - HW;
    const py = (signups / YMAX) * 2 * HH - HH;
    const pz = (emails / ZMAX) * 2 * HD - HD;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const x1 = px * cy + pz * sy;
    const z1 = -px * sy + pz * cy;
    return {
      x: this.cx + x1 * this.scale,
      y: this.cy - (py * cp + z1 * sp) * this.scale,
      depth: z1 * cp - py * sp,
    };
  }

  draw(g: Gfx): void {
    const k = this.sub === 0 ? easeOut((this.t - 0.6) / 1.2) : 1; // depth cues fade in as it turns
    this.drawBox(g, k);
    this.drawPlane(g);

    // Dots, far ones first, each with a faint stem to the floor so depth is readable.
    const items = PLANE_DATA.map((p) => ({ p, at: this.project(p.x[0], p.y, p.x[1]) }));
    items.sort((a, b) => b.at.depth - a.at.depth);
    for (const { p, at } of items) {
      const floor = this.project(p.x[0], 0, p.x[1]);
      g.line(at.x, at.y, floor.x, floor.y, `rgba(255, 79, 216, ${0.25 * k})`, 1.5, [4, 6]);
      g.dot(floor.x, floor.y, 3, C.magenta, 0, 0.4 * k);
      const onPlane = this.project(p.x[0], clamp(predictMany(this.model, p.x), 0, YMAX), p.x[1]);
      g.glowLine(at.x, at.y, onPlane.x, onPlane.y, C.red, 3, 10, 0.9);
      g.dot(at.x, at.y, 10, C.magenta, 16);
    }
    this.drawPanel(g);
    g.text('drag to turn', 1240, 950, { size: 20, color: C.faint, align: 'right', alpha: k });
  }

  private drawBox(g: Gfx, k: number): void {
    const P = (s: number, y: number, e: number) => this.project(s, y, e);
    const seg = (a: Projected, b: Projected, color: string, w = 1.5) => g.line(a.x, a.y, b.x, b.y, color, w);

    // Floor grid and back wall.
    for (let s = 0; s <= XMAX; s++) seg(P(s, 0, 0), P(s, 0, ZMAX), `rgba(140,150,220,${0.14 * k})`);
    for (let e = 0; e <= ZMAX; e++) seg(P(0, 0, e), P(XMAX, 0, e), `rgba(140,150,220,${0.14 * k})`);
    for (let y = 0; y <= YMAX; y += 50) {
      seg(P(0, y, ZMAX), P(XMAX, y, ZMAX), `rgba(140,150,220,${0.12 * k})`);
      seg(P(0, y, 0), P(0, y, ZMAX), `rgba(140,150,220,${0.12 * k})`);
    }

    // Axes.
    seg(P(0, 0, 0), P(XMAX, 0, 0), C.axis, 2);
    seg(P(0, 0, 0), P(0, YMAX, 0), C.axis, 2);
    seg(P(XMAX, 0, 0), P(XMAX, 0, ZMAX), `rgba(190,200,255,${0.55 * k})`, 2);

    for (let s = 0; s <= XMAX; s += 2) {
      const a = P(s, 0, 0);
      g.text(`$${s}k`, a.x, a.y + 36, { size: 24, color: C.dim, align: 'center', mono: true });
    }
    for (let y = 0; y <= YMAX; y += 50) {
      const a = P(0, y, 0);
      g.text(String(y), a.x - 16, a.y + 8, { size: 24, color: C.dim, align: 'right', mono: true });
    }
    for (let e = 2; e <= ZMAX; e += 2) {
      const a = P(XMAX, 0, e);
      g.text(`${e}k`, a.x + 16, a.y + 20, { size: 24, color: C.dim, mono: true, alpha: k });
    }
    const sx = P(XMAX / 2, 0, 0);
    g.text('Ad spend', sx.x, sx.y + 76, { size: 28, weight: 600, align: 'center' });
    const ez = P(XMAX, 0, ZMAX * 0.6);
    g.text('Emails sent', ez.x + 30, ez.y + 64, { size: 28, weight: 600, color: C.gold, alpha: k });
    const yt = P(0, YMAX, 0);
    g.text('Sign-ups', yt.x, yt.y - 22, { size: 28, weight: 600, align: 'center' });
  }

  private drawPlane(g: Gfx): void {
    const at = (s: number, e: number) => this.project(s, clamp(predictMany(this.model, [s, e]), 0, YMAX), e);
    const corners = [at(0, 0), at(XMAX, 0), at(XMAX, ZMAX), at(0, ZMAX)];
    const ctx = g.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(62, 230, 255, 0.10)';
    ctx.beginPath();
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    for (let s = 0; s <= XMAX; s += 2) {
      const a = at(s, 0);
      const b = at(s, ZMAX);
      g.line(a.x, a.y, b.x, b.y, 'rgba(62, 230, 255, 0.35)', 1.5);
    }
    for (let e = 0; e <= ZMAX; e += 2) {
      const a = at(0, e);
      const b = at(XMAX, e);
      // The front edge (no emails) is the old line: keep it bright so the link is visible.
      if (e === 0) g.glowLine(a.x, a.y, b.x, b.y, C.cyan, 5, 22);
      else g.line(a.x, a.y, b.x, b.y, 'rgba(62, 230, 255, 0.35)', 1.5);
    }
  }

  private drawPanel(g: Gfx): void {
    const PX = 1270;
    const PW = 580;
    const top = 240;
    g.panel(PX, top, PW, 690);
    const L = PX + 40;
    const R = PX + PW - 40;
    g.text('THE AI MODEL', L, top + 52, { size: 24, color: C.cyan, weight: 700 });
    g.text('sign-ups = start', L, top + 96, { size: 27, weight: 600 });
    g.text('+ ad slope × ad spend', L + 28, top + 130, { size: 27, weight: 600 });
    g.text('+ email slope × emails', L + 28, top + 164, { size: 27, weight: 600, color: C.gold });

    const m = this.model;
    const mse = meanSquaredErrorMany(m, PLANE_DATA);
    const rows: [string, string, string, string][] = [
      ['start', fmt(m.start), 'sign-ups with no ads or emails', C.cyan],
      ['ad slope', fmt(m.weights[0], 2), 'extra sign-ups per $1k of ads', C.cyan],
      ['email slope', fmt(m.weights[1], 2), 'extra sign-ups per 1,000 emails', C.gold],
      ['error score', fmt(mse, 0), 'average of the squared misses', C.red],
    ];
    rows.forEach(([name, value, label, color], i) => {
      const y = top + 232 + i * 82;
      g.text(name, L, y, { size: 28 });
      g.text(value, R, y, { size: 38, mono: true, weight: 700, align: 'right', color, glow: 10 });
      g.text(label, L, y + 32, { size: 21, color: C.dim });
    });
    g.text(`typical miss ≈ ${fmt(Math.sqrt(mse), 0)} sign-ups`, L, top + 578, { size: 25, color: C.dim });
    g.text(`ads only: error score ${fmt(this.lineError, 0)}`, L, top + 616, { size: 21, color: C.faint });
    if (this.sub === 1) g.text(`learning step ${this.learnSteps}`, L, top + 656, { size: 23, color: C.gold, weight: 600 });
  }
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
