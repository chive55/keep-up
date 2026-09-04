# Keep Up

A phone-first browser game: keep the ball in the air by tapping under it. Floor collision ends the run. Score bumps, ride combo multipliers, and watch difficulty ramp slowly.

## Play

Install dependencies, then start the Vite dev server:

    npm install
    npm run dev

Open the local URL Vite prints (usually http://localhost:5173).

### Preview production build

    npm run build
    npm run preview

## Controls

- Tap / click / Space: bump the ball up when your tap is roughly under it (generous horizontal hitbox)
- P or Esc: pause / resume

## Stack

Vite + TypeScript + Canvas 2D. Fully static; no React, SSR, or backend.
