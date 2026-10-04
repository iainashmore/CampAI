// Drawing helpers. Every scene draws on a fixed 1920×1080 stage that is scaled to fit
// whatever screen or projector the deck is shown on.

export const W = 1920;
export const H = 1080;

export const C = {
  bg: '#070914',
  bgGlow: '#121638',
  panel: 'rgba(22, 26, 58, 0.82)',
  panelEdge: 'rgba(120, 140, 255, 0.28)',
  grid: 'rgba(140, 150, 220, 0.12)',
  axis: 'rgba(190, 200, 255, 0.55)',
  text: '#eef0ff',
  dim: '#9aa0c8',
  faint: '#5d6390',
  cyan: '#3ee6ff',
  magenta: '#ff4fd8',
  gold: '#ffc94a',
  red: '#ff5a6e',
  green: '#4dffa0',
};

export const FONT = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';
export const MONO = '"SF Mono", Menlo, Consolas, "Roboto Mono", monospace';

export type Align = CanvasTextAlign;

export interface TextOpts {
  size?: number;
  weight?: number | string;
  color?: string;
  align?: Align;
  baseline?: CanvasTextBaseline;
  mono?: boolean;
  glow?: number;
  alpha?: number;
}

export class Gfx {
  readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  /** Fit the 1920×1080 stage into the window, sharp on high-DPI screens. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(window.innerWidth * dpr);
    const ch = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.scale = Math.min(cw / W, ch / H);
    this.ox = (cw - W * this.scale) / 2;
    this.oy = (ch - H * this.scale) / 2;
  }

  /** Window (CSS pixel) coordinates to stage coordinates. */
  toStage(clientX: number, clientY: number): { x: number; y: number } {
    const dpr = window.devicePixelRatio || 1;
    return { x: (clientX * dpr - this.ox) / this.scale, y: (clientY * dpr - this.oy) / this.scale };
  }

  begin(): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    const g = ctx.createRadialGradient(W * 0.5, H * 0.35, 50, W * 0.5, H * 0.45, W * 0.75);
    g.addColorStop(0, C.bgGlow);
    g.addColorStop(1, C.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  text(s: string, x: number, y: number, o: TextOpts = {}): number {
    const { ctx } = this;
    ctx.save();
    ctx.font = `${o.weight ?? 400} ${o.size ?? 28}px ${o.mono ? MONO : FONT}`;
    ctx.fillStyle = o.color ?? C.text;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = o.baseline ?? 'alphabetic';
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    if (o.glow) {
      ctx.shadowColor = o.color ?? C.text;
      ctx.shadowBlur = o.glow;
    }
    ctx.fillText(s, x, y);
    const w = ctx.measureText(s).width;
    ctx.restore();
    return w;
  }

  measure(s: string, size: number, weight: number | string = 400, mono = false): number {
    const { ctx } = this;
    ctx.save();
    ctx.font = `${weight} ${size}px ${mono ? MONO : FONT}`;
    const w = ctx.measureText(s).width;
    ctx.restore();
    return w;
  }

  /** A line drawn twice: a soft wide glow and a bright core. */
  glowLine(x1: number, y1: number, x2: number, y2: number, color: string, width = 4, glow = 18, alpha = 1): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, width * 0.35);
    ctx.stroke();
    ctx.restore();
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1, dash?: number[]): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  dot(x: number, y: number, r: number, color: string, glow = 16, alpha = 1): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  panel(x: number, y: number, w: number, h: number, alpha = 1): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = C.panel;
    ctx.strokeStyle = C.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 22);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOut = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/** Move `current` towards `target` smoothly, independent of frame rate. */
export const approach = (current: number, target: number, rate: number, dt: number): number =>
  target + (current - target) * Math.exp(-rate * dt);

export const fmt = (v: number, dp = 1): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
