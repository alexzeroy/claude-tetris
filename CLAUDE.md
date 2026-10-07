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
- **`game.js`** — All game logic (~700 lines).

### game.js internals

**Board state:** a 20×10 matrix where `0` = empty, `1–7` = piece color index.

**Game loop:** `requestAnimationFrame`-based. A `dropAccum` timer advances each frame; when it exceeds `dropInterval` (starts at `1000 - (startLevel-1)*90` ms, shrinks 90ms per level, min 100ms), the active piece drops one row.

**Rotation:** clockwise via matrix transpose + row reversal. `tryRotate()` implements wall kicks by attempting ±1 and ±2 column offsets on collision.

**Scoring:** `LINE_SCORES = [0, 100, 300, 500, 800]` × level for 0–4 lines cleared. Soft drop +1/row, hard drop +2/cell.

**Ghost piece:** calculated by projecting the active piece downward until collision; rendered at 0.2 alpha.

**Game states:** `paused` (halts loop, shows overlay) and `gameOver` (triggered when a spawned piece immediately collides).

**Menú de pausa:** P o Escape alternan la pausa (`togglePause()`), que muestra el sub-panel `#pause-menu` dentro del overlay compartido: Reanudar, Reiniciar (`init()`), Ver controles (lista desplegable `#controls-list`) y selector de nivel inicial 1–10 (`#start-level-select` → `startLevel`, persistido en `localStorage` como `tetris.startLevel`; se aplica a la próxima partida — la partida en curso usa `gameStartLevel`, capturado en `init()`, y el nivel sube con `Math.max(gameStartLevel, floor(lines/10)+1)`). Con el menú abierto los inputs del juego quedan bloqueados (solo P/Escape; flechas/Espacio hacen `preventDefault`).

**Temas:** oscuro por defecto; `#theme-toggle` alterna `data-theme="light"` en `<html>` y guarda la elección en `localStorage`. Los colores viven como variables CSS en `:root` (`style.css`); `drawGrid()` lee `--grid` y `applyTheme()` redibuja el canvas (necesario en pausa/game over).

**Cola y hold:** `nextQueue` (5 piezas, `refillQueue()`); hold con C/Shift (`doHold()`, un uso por pieza vía `holdUsed`), slot `#hold-canvas`.

**Piezas especiales:** pentominós +/U/Y (índices 8–10, 8% de probabilidad), anillo 3×3 (12, 2%), single 1×1 (11, recompensa tras un Tetris). Power-up cada 7 líneas (`makePowerPiece()`, bloque 1×1 dorado índice 14 con emoji): bomba 3×3, rayo fila+columna, tinte (elimina el color más abundante), gravedad (compacta huecos), congelar 5s (`freezeUntil`).

**Combos:** `combo` multiplica la puntuación de línea en limpiezas consecutivas; bonus T-spin (`tSpinCorners()`), B2B (`b2b`), Perfect Clear. Efectos: `floatingTexts`/`flashRows` en canvas + beeps WebAudio (`beep()`).

**Habilidades:** barra de energía (+1/línea, máx. 10); con E se abre `#ability-menu`: revelar 5 siguientes, cambiar pieza, ralentizar 10s (`slowUntil`), deshacer último lock (`undoSnapshot` con `structuredClone`).

**Modos** (`#mode-select`, reinicia con `init()`): normal, sprint (40 líneas/2 min, `timeLeft`), basura (fila gris cada 10s, `addGarbageRow()`), obstáculos (`placeObstacles()`), invisible (`boardRevealUntil`), inversa (rotación CCW desde nivel 3).

### Key constants (top of game.js)

| Constant | Default | Notes |
|---|---|---|
| `COLS` / `ROWS` | 10 / 20 | If changed, also update canvas dimensions in `index.html` |
| `BLOCK` | 30px | Cell size in pixels |
| `COLORS` | 7 colors | Index 1–7 maps to piece types I, O, T, S, Z, J, L |
