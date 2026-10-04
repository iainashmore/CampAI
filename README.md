# CampAI: How Machines Learn

A live, animated alternative to slides for corporate AI enablement sessions. Each scene is a
small, real machine-learning model running in the browser, following one made-up company,
**Daily Grind** (a coffee subscription business). No server, no internet, no AI service.

## Presenting

1. Open `dist/index.html` (committed, ready to use; rebuild with `npm run build`) in Chrome, Edge or Safari (double-click works, or copy it to a USB stick).
2. Press **F** for full screen on the projector, and **N** to open presenter notes in a second window
   (drag it to your laptop screen).
3. Move with a clicker or the arrow keys. Press **H** for all keys.

| Key | Action |
| --- | --- |
| → Space Page Down | next step |
| ← Page Up | back a step |
| N | presenter notes window |
| F | full screen |
| B or . | black screen |
| Home / End | first / last scene |

The address bar keeps your place (`#2.3` = scene 2, step 3), so a reload resumes where you were.

## Scenes

| # | Scene | Idea | Status |
| --- | --- | --- | --- |
| 1 | Forecast sign-ups | regression, error score, gradient descent; a second input turns the line into a plane in 3D | built |
| 2 | Who will cancel? | classification, decision boundary, two kinds of mistake, cost-based cutoff | built |
| 3 | Too good to be true | overfitting, test data | planned |
| 4 | Inside a neural network | forward pass, backprop | planned |
| 5 | Reading support emails | word scores, text classification | planned |
| 6 | Finding customer groups | clustering | planned |
| 7 | Which offer to send? | explore vs exploit | planned |

## Developing

```sh
npm install
npm run dev     # live-reloading dev server
npm test        # model maths tests
npm run build   # writes the single self-contained dist/index.html
```

Every scene draws on a fixed 1920×1080 stage (`src/gfx.ts`) scaled to the screen. The maths for
each scene lives in `src/ml/` with tests, and the scene only displays what that code computes:
the visuals can be dramatic but every number shown is real.
