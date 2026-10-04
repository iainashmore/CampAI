import type { NotesPayload } from './deck';

/**
 * Presenter notes, opened with N from the deck. Lives in its own window so the presenter
 * can keep it on the laptop screen while the deck is on the projector. Talks to the deck
 * by postMessage, which also works when the deck is opened straight from a file.
 */
export function startNotesWindow(): void {
  document.title = 'CampAI: presenter notes';
  document.body.innerHTML = `
    <style>
      html, body { overflow: auto; }
      body { margin: 0; padding: 32px 40px; background: #0b0e1f; color: #eef0ff;
        font: 22px/1.5 "Segoe UI", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif; }
      .bar { display: flex; align-items: center; gap: 16px; color: #9aa0c8; font-size: 18px; }
      .bar .grow { flex: 1; }
      .timer { font: 600 28px "SF Mono", Menlo, Consolas, monospace; color: #ffc94a; cursor: pointer; }
      h1 { margin: 18px 0 8px; font-size: 34px; }
      .notes { white-space: pre-wrap; font-size: 26px; line-height: 1.55; max-width: 60em; }
      .next { margin-top: 28px; padding-top: 16px; border-top: 1px solid #2a3060; color: #9aa0c8; }
      .next b { color: #3ee6ff; font-weight: 600; }
      button { font: inherit; font-size: 20px; padding: 10px 26px; border-radius: 10px; border: 1px solid #3a4180;
        background: #161a3a; color: #eef0ff; cursor: pointer; }
      button:hover { background: #20265a; }
      .wait { color: #9aa0c8; }
    </style>
    <div class="bar">
      <span id="where">Waiting for the deck…</span>
      <span class="grow"></span>
      <span class="timer" id="timer" title="Click to reset">00:00</span>
      <button id="prev">← Back</button>
      <button id="next">Next →</button>
    </div>
    <h1 id="title"></h1>
    <div class="notes" id="notes"><span class="wait">Keep the deck window open. Use the arrow keys here or there.</span></div>
    <div class="next" id="next-up"></div>`;

  const $ = (id: string) => document.getElementById(id)!;
  const send = (dir: 'next' | 'prev' | 'hello') => window.opener?.postMessage({ type: 'campai-nav', dir }, '*');

  $('prev').addEventListener('click', () => send('prev'));
  $('next').addEventListener('click', () => send('next'));
  window.addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) send('next');
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) send('prev');
    else return;
    e.preventDefault();
  });

  let started = performance.now();
  $('timer').addEventListener('click', () => (started = performance.now()));
  setInterval(() => {
    const s = Math.floor((performance.now() - started) / 1000);
    $('timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 500);

  window.addEventListener('message', (e: MessageEvent) => {
    const p = e.data as NotesPayload;
    if (p?.type !== 'campai-state') return;
    $('where').textContent = `Scene ${p.sceneIndex + 1} of ${p.sceneCount}: ${p.sceneName} · step ${p.step + 1} of ${p.stepCount}`;
    $('title').textContent = p.title;
    $('notes').textContent = p.notes;
    $('next-up').innerHTML = '';
    if (p.next) {
      const b = document.createElement('b');
      b.textContent = p.next;
      $('next-up').append('Next: ', b);
    } else {
      $('next-up').textContent = 'End of the session.';
    }
  });

  // Say hello now and every few seconds, so the notes reconnect if the deck is reloaded.
  send('hello');
  setInterval(() => send('hello'), 3000);
}
