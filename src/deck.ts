import type { Gfx } from './gfx';

export interface Step {
  /** Big headline on screen. */
  title: string;
  /** One supporting line under the headline. */
  caption?: string;
  /** What the presenter says. Shown only in the notes window. */
  notes: string;
}

export interface Scene {
  id: string;
  name: string;
  steps: Step[];
  /** True when the scene draws its own headline (e.g. a title card). */
  ownHeadline?: boolean;
  /** Called on every step change. `from` is null when the scene is (re)entered from outside. */
  enter(step: number, from: number | null): void;
  update(dt: number): void;
  draw(g: Gfx): void;
  pointerDown?(x: number, y: number): void;
}

export interface DeckState {
  scene: number;
  step: number;
}

/** Everything the notes window needs to show, sent by postMessage. */
export interface NotesPayload {
  type: 'campai-state';
  sceneName: string;
  sceneIndex: number;
  sceneCount: number;
  step: number;
  stepCount: number;
  title: string;
  notes: string;
  next: string | null;
}

export class Deck {
  private pos: DeckState = { scene: 0, step: 0 };
  onChange: (() => void) | null = null;

  constructor(readonly scenes: Scene[]) {}

  get state(): DeckState {
    return { ...this.pos };
  }

  get scene(): Scene {
    return this.scenes[this.pos.scene];
  }

  get step(): Step {
    return this.scene.steps[this.pos.step];
  }

  goTo(scene: number, step: number): void {
    scene = Math.max(0, Math.min(this.scenes.length - 1, scene));
    step = Math.max(0, Math.min(this.scenes[scene].steps.length - 1, step));
    const sameScene = scene === this.pos.scene;
    const from = sameScene ? this.pos.step : null;
    this.pos = { scene, step };
    this.scene.enter(step, from);
    this.onChange?.();
  }

  next(): void {
    const { scene, step } = this.pos;
    if (step + 1 < this.scene.steps.length) this.goTo(scene, step + 1);
    else if (scene + 1 < this.scenes.length) this.goTo(scene + 1, 0);
  }

  prev(): void {
    const { scene, step } = this.pos;
    if (step > 0) this.goTo(scene, step - 1);
    else if (scene > 0) this.goTo(scene - 1, this.scenes[scene - 1].steps.length - 1);
  }

  notesPayload(): NotesPayload {
    const { scene, step } = this.pos;
    const s = this.scene;
    let next: string | null = null;
    if (step + 1 < s.steps.length) next = s.steps[step + 1].title;
    else if (scene + 1 < this.scenes.length) next = `${this.scenes[scene + 1].name}: ${this.scenes[scene + 1].steps[0].title}`;
    return {
      type: 'campai-state',
      sceneName: s.name,
      sceneIndex: scene,
      sceneCount: this.scenes.length,
      step,
      stepCount: s.steps.length,
      title: this.step.title,
      notes: this.step.notes,
      next,
    };
  }
}
