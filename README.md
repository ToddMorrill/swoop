# Swoop

A web implementation of the card game Swoop. The rules live in [CLAUDE.md](./CLAUDE.md);
this file is about running the code.

## Getting started

```bash
npm install
npm run dev        # open the printed http://localhost:5173 URL
```

You are always the bottom seat. Tap cards to select them, then **Play**. Cards you
cannot legally play are dimmed. Tapping an uncovered hidden card flips it — you find
out what it is only after committing.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the game locally with hot reload |
| `npm test` | Run the whole test suite (rules, engine, bots, UI) |
| `npm run sim` | Play thousands of bot-vs-bot games and print the results |
| `npm run typecheck` | Type-check without building |
| `npm run check:core` | Verify the rules engine stays free of UI dependencies |
| `npm run build` | Production build into `dist/` |
| `npm run check:pages` | Rehearse a GitHub Pages deploy and verify it locally |
| `npm run preview:pages` | Serve the production build at the deploy's base path |

The simulator takes arguments:

```bash
npm run sim -- --games 10000 --bots hard,easy,random,random --seed 42
npm run sim -- --games 500 --bots hard,hard --jokers true --target 500
```

## Publishing it

The game is entirely client-side — no server, no database, no network calls — so
GitHub Pages can host it as static files and anyone can play in their browser.

1. `git init`, commit, and push to a GitHub repo with `main` as the default branch.
2. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` runs the tests, builds, and
   deploys; the URL appears in the workflow summary.

The workflow works out the base path on its own: a project repo is served from
`username.github.io/<repo>/`, a repo named `username.github.io` from the domain
root.

### Rehearsing the deploy locally

`npm run dev` is a poor prediction of a Pages deploy: it serves unbundled source
from the domain root and falls back to `index.html` for unknown paths. Pages
serves a production build from a subdirectory and 404s anything that is not a
real file. Two commands close that gap:

```bash
npm run check:pages       # automated: build, serve like Pages, verify
npm run preview:pages     # then play the exact build at localhost:4173/swoop/
```

`check:pages` builds with the deploy's base path, serves `dist/` from a
deliberately dumb static server with no fallback, then checks that the page
loads, every asset it references resolves, nothing points at an external host,
and unknown paths 404. Pass a repo name if yours is not `swoop`:

```bash
node scripts/check-pages.mjs my-repo-name
```

Visitors download about 232 kB (66 kB gzipped) once, then everything — including
the opponents — runs on their own machine.

## How the code is laid out

```
src/core/    the rules engine — pure TypeScript, no React, no DOM, no Math.random
src/bots/    bot policies; they read a PlayerView, never the full game state
src/sim/     headless game runner used for testing and tuning
src/ui/      React components, a thin renderer over the engine
tests/       spec scenarios, engine edge cases, bot ladder, UI behaviour
```

Two rules keep this healthy, and `npm run check:core` enforces the first:

1. **`src/core` never imports from React or touches the DOM.** That is what makes a
   native iPhone front end a matter of writing new views rather than rewriting the game.
2. **The UI never mutates state directly.** Every change goes through `applyMove`, which
   is pure and throws on an illegal move rather than quietly correcting it.

## Two design notes

**Everything is seeded.** No code in the engine calls `Math.random()`; shuffling takes an
injected RNG. Any game can be replayed exactly from its seed, which matters for
reproducing a bug and is a prerequisite for training bots by self-play later.

**Bots see only what a player would see.** `viewFor(state, seat)` hides other players'
hands and every face-down card, and bots consume that view rather than the game state.
Skill tiers differ in policy, never in information — and the same projection is already
the wire format an online mode would need.

## Bots

| Tier | Policy |
| --- | --- |
| `random` | Uniform over legal moves. The baseline. |
| `easy` | Sheds its most expensive card each turn, one card at a time. Never builds sets, never spots a swoop, never gambles on a face-down by choice. |
| `hard` | Takes any swoop, flips face-downs while they are cheap (free on an empty pile or a King), sheds point liabilities in bulk, and holds wilds back as an escape hatch. |

Over 10,000 four-player games: `hard` wins 99.4% with an average final score of 2.2,
against 123.8 for `easy` and ~220 for `random`.
