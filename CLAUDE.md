# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

No build process needed. Open `index.html` directly in a browser, or serve it locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

There are no tests, linters, or dependencies to install.

## Architecture

Three-file vanilla JavaScript app using the HTML5 Canvas API:

- **`index.html`** — DOM structure with two `<canvas>` elements: `#board` (300×600px, main grid) and `#next-canvas` (120×120px, piece preview), plus score/level display and a pause/game-over overlay.
- **`style.css`** — Dark arcade theme, flexbox layout.
- **`game.js`** — All game logic (~300 lines).

### game.js internals

**Board state:** a 20×10 matrix where `0` = empty, `1–7` = piece color index.

**Game loop:** `requestAnimationFrame`-based. A `dropAccum` timer advances each frame; when it exceeds `dropInterval` (starts at 1000ms, shrinks 90ms per level, min 100ms), the active piece drops one row.

**Rotation:** clockwise via matrix transpose + row reversal. `tryRotate()` implements wall kicks by attempting ±1 and ±2 column offsets on collision.

**Scoring:** `LINE_SCORES = [0, 100, 300, 500, 800]` × level for 0–4 lines cleared. Soft drop +1/row, hard drop +2/cell.

**Ghost piece:** calculated by projecting the active piece downward until collision; rendered at 0.2 alpha.

**Game states:** `paused` (halts loop, shows overlay) and `gameOver` (triggered when a spawned piece immediately collides).

**Temas:** oscuro por defecto; `#theme-toggle` alterna `data-theme="light"` en `<html>` y guarda la elección en `localStorage`. Los colores viven como variables CSS en `:root` (`style.css`); `drawGrid()` lee `--grid` y `applyTheme()` redibuja el canvas (necesario en pausa/game over).

### Key constants (top of game.js)

| Constant | Default | Notes |
|---|---|---|
| `COLS` / `ROWS` | 10 / 20 | If changed, also update canvas dimensions in `index.html` |
| `BLOCK` | 30px | Cell size in pixels |
| `COLORS` | 7 colors | Index 1–7 maps to piece types I, O, T, S, Z, J, L |
