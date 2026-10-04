import { Deck, type NotesPayload } from './deck';
import { C, Gfx, H, W, easeOut } from './gfx';
import { startNotesWindow } from './notes';
import { ForecastScene } from './scenes/forecast';
import { TitleScene } from './scenes/title';

if (location.hash === '#notes') startNotesWindow();
else startDeck();

function startDeck(): void {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const g = new Gfx(canvas);
  const deck = new Deck([new TitleScene(), new ForecastScene()]);

  let changeT = 0;
  let sinceStart = 0;
  let blackout = false;
  let showHelp = false;
  let notesWin: Window | null = null;

  const sendNotes = () => {
    const payload: NotesPayload = deck.notesPayload();
    if (notesWin && !notesWin.closed) notesWin.postMessage(payload, '*');
  };

  deck.onChange = () => {
    changeT = 0;
    const { scene, step } = deck.state;
    history.replaceState(null, '', `#${scene + 1}.${step + 1}`);
    sendNotes();
  };

  // Resume where we were after a reload, e.g. #2.3 = scene 2, step 3.
  const m = /^#(\d+)\.(\d+)$/.exec(location.hash);
  deck.goTo(m ? Number(m[1]) - 1 : 0, m ? Number(m[2]) - 1 : 0);

  const openNotes = () => {
    const url = location.href.split('#')[0] + '#notes';
    notesWin = window.open(url, 'campai-notes', 'width=1000,height=760');
  };

  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; dir?: string };
    if (d?.type !== 'campai-nav') return;
    if (e.source && 'postMessage' in e.source) notesWin = e.source as Window;
    if (d.dir === 'next') deck.next();
    else if (d.dir === 'prev') deck.prev();
    else sendNotes();
  });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
      case 'Enter':
        deck.next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
      case 'Backspace':
        deck.prev();
        break;
      case 'Home':
        deck.goTo(0, 0);
        break;
      case 'End':
        deck.goTo(deck.scenes.length - 1, 0);
        break;
      case 'n':
      case 'N':
        openNotes();
        break;
      case 'f':
      case 'F':
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
        break;
      case 'b':
      case 'B':
      case '.': // most clickers send this for "black screen"
        blackout = !blackout;
        break;
      case '?':
      case 'h':
      case 'H':
        showHelp = !showHelp;
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  canvas.addEventListener('pointerdown', (e) => {
    const p = g.toStage(e.clientX, e.clientY);
    deck.scene.pointerDown?.(p.x, p.y);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!canvas.hasPointerCapture(e.pointerId)) return;
    const p = g.toStage(e.clientX, e.clientY);
    deck.scene.pointerMove?.(p.x, p.y);
  });
  const release = () => deck.scene.pointerUp?.();
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  window.addEventListener('resize', () => g.resize());
  g.resize();

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    changeT += dt;
    sinceStart += dt;
    deck.scene.update(dt);

    g.begin();
    if (blackout) {
      g.ctx.fillStyle = '#000';
      g.ctx.fillRect(0, 0, W, H);
    } else {
      deck.scene.draw(g);
      drawChrome();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function drawChrome(): void {
    const step = deck.step;
    const { scene, step: stepIndex } = deck.state;
    if (!deck.scene.ownHeadline) {
      const a = easeOut(changeT / 0.5);
      const rise = (1 - a) * 16;
      g.text(step.title, 90, 112 + rise, { size: 62, weight: 800, alpha: a });
      if (step.caption) g.text(step.caption, 92, 172 + rise, { size: 32, color: C.dim, alpha: a });
    }

    // Progress: one pip per step, grouped by scene.
    const pips: { on: boolean; current: boolean; gap: boolean }[] = [];
    deck.scenes.forEach((s, si) => {
      s.steps.forEach((_, ti) => {
        const before = si < scene || (si === scene && ti <= stepIndex);
        pips.push({ on: before, current: si === scene && ti === stepIndex, gap: ti === 0 && si > 0 });
      });
    });
    let x = W / 2 - pips.length * 11;
    for (const p of pips) {
      if (p.gap) x += 14;
      g.dot(x, H - 40, p.current ? 7 : 5, p.on ? C.cyan : C.faint, p.current ? 14 : 0, p.on ? 1 : 0.6);
      x += 22;
    }
    g.text(deck.scene.name, 60, H - 32, { size: 22, color: C.faint });
    // For the first few seconds the corner shows the keys, then settles to the name.
    const hintA = 1 - easeOut((sinceStart - 6) / 1.5);
    if (hintA > 0) g.text('→ next   ← back   N notes   F full screen   H help', W - 60, H - 32, { size: 22, color: C.dim, align: 'right', alpha: hintA });
    else g.text('CampAI', W - 60, H - 32, { size: 22, color: C.faint, align: 'right' });
    if (showHelp) drawHelp();
  }

  function drawHelp(): void {
    const rows: [string, string][] = [
      ['→  Space  Page Down', 'next step'],
      ['←  Page Up', 'back a step'],
      ['N', 'open presenter notes (drag to your laptop screen)'],
      ['F', 'full screen'],
      ['B  or  .', 'black screen'],
      ['Home / End', 'first / last scene'],
      ['Click the chart', 'some scenes let you add data live'],
    ];
    const x = W / 2 - 520;
    const y = 300;
    g.panel(x, y, 1040, 120 + rows.length * 56);
    g.text('Presenter keys', x + 50, y + 70, { size: 34, weight: 700, color: C.cyan });
    rows.forEach(([k, v], i) => {
      g.text(k, x + 50, y + 140 + i * 56, { size: 28, mono: true, color: C.gold });
      g.text(v, x + 440, y + 140 + i * 56, { size: 28 });
    });
  }
}
