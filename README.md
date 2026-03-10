# morphisma

Audio & visual experiments in the browser, built with [Next.js](https://nextjs.org) and [Elementary Audio](https://www.elementary.audio/).

**Work in progress.**

## Experiments

- **Shepard-Risset Glissando** — endlessly rising/falling tone from phase-offset oscillators
- **Shepard Delay** — delay effect where echoes pitch-shift in an infinite spiral (per-voice feedback)
- **Shepard Delay — Global Feedback** — variant with a global feedback loop for denser textures
- **Tape Delay** — circular buffer tape model with movable play head and feedback
- **Risset Tape Delay** — single play head on a circular buffer for pitch-shifting tape effects

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

- Next.js 16 / React 19 / TypeScript
- Elementary Audio (`@elemaudio/core` + `@elemaudio/web-renderer`)
