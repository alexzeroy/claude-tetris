'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // 1 I - cyan
  '#ffd54f', // 2 O - yellow
  '#ba68c8', // 3 T - purple
  '#81c784', // 4 S - green
  '#e57373', // 5 Z - red
  '#90caf9', // 6 J - pale blue
  '#ffb74d', // 7 L - orange
  '#f06292', // 8 pentominó +
  '#4db6ac', // 9 pentominó U
  '#dce775', // 10 pentominó Y
  '#ffffff', // 11 single 1×1 (recompensa)
  '#a1887f', // 12 anillo 3×3
  '#78909c', // 13 bloques fijos / basura
  '#ffd700', // 14 power-up
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + pentominó
  [[9,0,9],[9,9,9],[0,0,0]],                  // U pentominó
  [[0,10],[10,10],[0,10],[0,10]],             // Y pentominó
  [[11]],                                      // single 1×1
  [[12,12,12],[12,0,12],[12,12,12]],          // anillo 3×3 hueco
];

const PENTOMINOES = [8, 9, 10];
const LINE_SCORES = [0, 100, 300, 500, 800];

const POWER_TYPES = ['bomb', 'ray', 'paint', 'gravity', 'freeze'];
const POWER_ICONS = { bomb: '💣', ray: '⚡', paint: '🎨', gravity: '🧲', freeze: '❄️' };
const POWER_EVERY = 7;      // líneas entre power-ups
const ENERGY_MAX = 10;      // líneas para llenar la barra de habilidad
const SPRINT_GOAL = 40;
const SPRINT_TIME = 120000; // 2 minutos
const GARBAGE_EVERY = 10000;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const energyFill = document.getElementById('energy-fill');
const energyTrack = document.getElementById('energy-track');
const energyHint = document.getElementById('energy-hint');
const objectiveEl = document.getElementById('objective');
const modeSelect = document.getElementById('mode-select');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsList = document.getElementById('controls-list');
const startLevelSelect = document.getElementById('start-level-select');
const abilityMenu = document.getElementById('ability-menu');
const abilityCancel = document.getElementById('ability-cancel');
const themeToggle = document.getElementById('theme-toggle');

let board, current, nextQueue, hold, holdUsed;
let score, lines, level, combo, b2b, energy;
let paused, gameOver, abilityOpen;
let lastTime, dropAccum, dropInterval, animId;
let mode, timeLeft, garbageTimer;
let nextPowerupAt, undoSnapshot;
let freezeUntil, slowUntil, revealQueueUntil, queueRevealed, boardRevealUntil;
let lastMoveWasRotation;
let floatingTexts, flashRows;

// Nivel con el que empieza la próxima partida (configurable en el menú de pausa)
let startLevel = 1;
// Nivel inicial de la partida EN CURSO (cambiar el selector no afecta a la actual)
let gameStartLevel = 1;
try {
  const saved = parseInt(localStorage.getItem('tetris.startLevel'), 10);
  if (saved >= 1 && saved <= 10) startLevel = saved;
} catch (e) {}

/* ---------- Audio (WebAudio, sin assets) ---------- */

let audioCtx = null;

function beep(freq, dur = 0.08, type = 'square', vol = 0.04) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

/* ---------- Piezas ---------- */

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, power: null, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function makePowerPiece() {
  const power = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
  return { type: 14, shape: [[14]], power, x: Math.floor(COLS / 2), y: 0 };
}

// Pieza nueva "en limpio" (misma identidad, forma y posición de spawn)
function freshPiece(p) {
  if (p.type === 14) return { type: 14, shape: [[14]], power: p.power, x: Math.floor(COLS / 2), y: 0 };
  return makePiece(p.type);
}

function randomPiece() {
  const roll = Math.random();
  if (roll < 0.02) return makePiece(12);                                           // anillo 3×3
  if (roll < 0.10) return makePiece(PENTOMINOES[Math.floor(Math.random() * 3)]);   // pentominó
  return makePiece(Math.floor(Math.random() * 7) + 1);
}

function refillQueue() {
  while (nextQueue.length < 5) nextQueue.push(randomPiece());
}

/* ---------- Colisiones y rotación ---------- */

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  // modo inversa: rotación antihoraria a partir del nivel 3
  const ccw = mode === 'inversa' && level >= 3;
  let rotated = rotateCW(current.shape);
  if (ccw) rotated = rotateCW(rotateCW(rotated));
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastMoveWasRotation = true;
      return;
    }
  }
}

/* ---------- Lock, líneas y puntuación ---------- */

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  const now = performance.now();
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      flashRows.push({ row: r, until: now + 250 });
      r++;
    }
  }
  return cleared;
}

function tSpinCorners() {
  // esquinas de la caja 3×3 de la pieza T
  const corners = [[0, 0], [0, 2], [2, 0], [2, 2]];
  let n = 0;
  for (const [dr, dc] of corners) {
    const r = current.y + dr, c = current.x + dc;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c]) n++;
  }
  return n;
}

function scoreClears(cleared, tSpin) {
  if (tSpin) {
    score += 400 * level * (cleared + 1);
    addFloat('T-SPIN!', '#ba68c8');
    beep(700, 0.12, 'sawtooth');
  }

  if (cleared > 0) {
    combo++;
    const mult = Math.max(1, combo);
    let gained = (LINE_SCORES[cleared] || LINE_SCORES[4]) * level * mult;

    const special = cleared >= 4 || tSpin;
    if (special && b2b) {
      gained = Math.floor(gained * 1.5);
      addFloat('B2B!', '#ffd54f');
    }
    b2b = special;

    score += gained;
    lines += cleared;
    energy = Math.min(ENERGY_MAX, energy + cleared);

    if (combo >= 2) {
      addFloat(`COMBO x${mult}`, '#4dd0e1');
      beep(400 + combo * 80, 0.08);
    }
    if (cleared === 4) {
      addFloat('TETRIS! +pieza extra', '#7aa2f7');
      nextQueue.unshift(makePiece(11)); // recompensa: single 1×1
      beep(880, 0.15, 'triangle');
    }
    if (board.every(row => row.every(v => v === 0))) {
      score += 2000 * level;
      addFloat('PERFECT CLEAR!', '#81c784');
      beep(1040, 0.2, 'triangle');
    }
    if (lines >= nextPowerupAt) {
      nextPowerupAt += POWER_EVERY;
      nextQueue.unshift(makePowerPiece());
      addFloat('¡POWER-UP!', '#ffd700');
      beep(660, 0.12);
    }

    level = Math.max(gameStartLevel, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    beep(440 + cleared * 110, 0.1);

    if (mode === 'sprint' && lines >= SPRINT_GOAL) {
      updateHUD();
      finishGame('¡OBJETIVO CUMPLIDO!');
      return;
    }
  } else {
    combo = 0;
  }
  updateHUD();
}

function lockPiece() {
  // snapshot para la habilidad "deshacer"
  undoSnapshot = structuredClone({
    board, current, nextQueue, hold, holdUsed,
    score, lines, level, combo, b2b, dropInterval, nextPowerupAt,
  });

  if (mode === 'invisible') boardRevealUntil = performance.now() + 1000;

  const tSpin = current.type === 3 && lastMoveWasRotation && tSpinCorners() >= 3;

  if (current.power) {
    applyPower(current.power, current.y, current.x);
  } else {
    merge();
  }

  const cleared = clearLines();
  scoreClears(cleared, tSpin && !current.power);
  if (gameOver) return;
  spawn();
}

/* ---------- Power-ups ---------- */

function applyPower(power, r, c) {
  beep(200, 0.2, 'sawtooth');
  switch (power) {
    case 'bomb':
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) board[nr][nc] = 0;
        }
      addFloat('💣 ¡BOOM!', '#ffd700');
      break;
    case 'ray':
      for (let i = 0; i < COLS; i++) board[r][i] = 0;
      for (let i = 0; i < ROWS; i++) board[i][c] = 0;
      addFloat('⚡ RAYO', '#ffd700');
      break;
    case 'paint': {
      // elimina todos los bloques del color más abundante
      const counts = {};
      for (const row of board)
        for (const v of row)
          if (v) counts[v] = (counts[v] || 0) + 1;
      let best = 0, bestN = 0;
      for (const k in counts)
        if (counts[k] > bestN) { best = +k; bestN = counts[k]; }
      if (best)
        for (let rr = 0; rr < ROWS; rr++)
          for (let cc = 0; cc < COLS; cc++)
            if (board[rr][cc] === best) board[rr][cc] = 0;
      addFloat('🎨 TINTE', '#ffd700');
      break;
    }
    case 'gravity':
      // compacta cada columna eliminando huecos
      for (let col = 0; col < COLS; col++) {
        const stack = [];
        for (let row = ROWS - 1; row >= 0; row--)
          if (board[row][col]) stack.push(board[row][col]);
        for (let i = 0; i < ROWS; i++)
          board[ROWS - 1 - i][col] = stack[i] || 0;
      }
      addFloat('🧲 GRAVEDAD', '#ffd700');
      break;
    case 'freeze':
      freezeUntil = performance.now() + 5000;
      addFloat('❄️ CONGELADO 5s', '#4dd0e1');
      break;
  }
}

/* ---------- Spawn, hold y caída ---------- */

function spawn() {
  refillQueue();
  current = nextQueue.shift();
  refillQueue();
  holdUsed = false;
  lastMoveWasRotation = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
  updateHUD();
}

function doHold() {
  if (holdUsed || !current) return;
  const stored = hold;
  hold = freshPiece(current);
  if (stored) {
    current = freshPiece(stored);
  } else {
    refillQueue();
    current = nextQueue.shift();
    refillQueue();
  }
  holdUsed = true;
  lastMoveWasRotation = false;
  dropAccum = 0;
  beep(330, 0.06, 'sine');
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawHold();
  drawNext();
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    lastMoveWasRotation = false;
    updateHUD();
  } else {
    lockPiece();
  }
}

/* ---------- Modos de desafío ---------- */

function placeObstacles() {
  let placed = 0, guard = 0;
  while (placed < 15 && guard < 200) {
    guard++;
    const r = ROWS - 1 - Math.floor(Math.random() * 8);
    const c = Math.floor(Math.random() * COLS);
    if (board[r][c]) continue;
    if (board[r].filter(v => v).length >= COLS - 3) continue;
    board[r][c] = 13;
    placed++;
  }
}

function addGarbageRow() {
  if (board[0].some(v => v !== 0)) {
    endGame();
    return;
  }
  board.shift();
  const row = new Array(COLS).fill(13);
  row[Math.floor(Math.random() * COLS)] = 0;
  board.push(row);
  // empuja la pieza activa hacia arriba si la basura la pisa
  if (current && collide(current.shape, current.x, current.y)) {
    current.y--;
    if (collide(current.shape, current.x, current.y)) {
      endGame();
      return;
    }
  }
  beep(150, 0.1);
}

/* ---------- Habilidades ---------- */

function openAbilityMenu() {
  if (gameOver || paused || abilityOpen) return;
  if (energy < ENERGY_MAX) {
    addFloat('Energía insuficiente', '#888888');
    beep(160, 0.08);
    return;
  }
  abilityOpen = true;
  cancelAnimationFrame(animId);
  abilityMenu.classList.remove('hidden');
}

function closeAbilityMenu() {
  if (!abilityOpen) return;
  abilityOpen = false;
  abilityMenu.classList.add('hidden');
  if (!gameOver && !paused) {
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  }
}

function useAbility(name) {
  energy = 0;
  switch (name) {
    case 'reveal':
      revealQueueUntil = performance.now() + 20000;
      queueRevealed = true;
      addFloat('👁 Cola revelada 20s', '#7aa2f7');
      break;
    case 'swap':
      current = randomPiece();
      dropAccum = 0;
      lastMoveWasRotation = false;
      addFloat('🔄 Pieza cambiada', '#7aa2f7');
      if (collide(current.shape, current.x, current.y)) {
        closeAbilityMenu();
        endGame();
        return;
      }
      break;
    case 'slow':
      slowUntil = performance.now() + 10000;
      addFloat('🐢 Tiempo lento 10s', '#7aa2f7');
      break;
    case 'undo':
      if (!undoSnapshot) {
        energy = ENERGY_MAX; // no gastar si no hay nada que deshacer
        addFloat('Nada que deshacer', '#888888');
        break;
      }
      ({ board, current, nextQueue, hold, holdUsed,
         score, lines, level, combo, b2b, dropInterval, nextPowerupAt } = undoSnapshot);
      undoSnapshot = null;
      // la pieza vuelve arriba para seguir jugándola
      current.x = Math.floor(COLS / 2) - Math.floor(current.shape[0].length / 2);
      current.y = 0;
      dropAccum = 0;
      if (mode === 'invisible') boardRevealUntil = performance.now() + 1500;
      addFloat('↩️ Deshecho', '#7aa2f7');
      break;
  }
  beep(880, 0.12, 'triangle');
  drawNext();
  drawHold();
  updateHUD();
  closeAbilityMenu();
}

/* ---------- HUD y efectos ---------- */

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo >= 2 ? `x${combo}` : '–';
  energyFill.style.width = `${(energy / ENERGY_MAX) * 100}%`;
  energyTrack.classList.toggle('full', energy >= ENERGY_MAX);
  energyHint.classList.toggle('hidden', energy < ENERGY_MAX);
  holdCanvas.classList.toggle('locked', holdUsed);
}

function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateObjective(now) {
  const parts = [];
  if (now < freezeUntil) parts.push(`❄️ ${Math.ceil((freezeUntil - now) / 1000)}s`);
  if (now < slowUntil) parts.push(`🐢 ${Math.ceil((slowUntil - now) / 1000)}s`);
  if (mode === 'sprint') parts.push(`${Math.max(0, SPRINT_GOAL - lines)} líneas · ${formatTime(timeLeft)}`);
  if (mode === 'basura') parts.push(`Basura en ${Math.ceil((GARBAGE_EVERY - garbageTimer) / 1000)}s`);
  objectiveEl.textContent = parts.join(' · ');
}

function addFloat(text, color) {
  floatingTexts.push({
    text, color,
    x: canvas.width / 2,
    y: 220 + floatingTexts.length * 24,
    alpha: 1,
  });
}

function updateFloatingTexts(dt) {
  for (const f of floatingTexts) {
    f.y -= dt * 0.03;
    f.alpha -= dt / 1500;
  }
  floatingTexts = floatingTexts.filter(f => f.alpha > 0);
}

/* ---------- Dibujo ---------- */

function drawBlockPx(context, px, py, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = COLORS[colorIndex];
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, Math.max(2, size * 0.13));
  context.globalAlpha = 1;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  drawBlockPx(context, x * size, y * size, colorIndex, size, alpha);
}

function drawPowerIcon(context, cx, cy, size, power) {
  context.font = `${Math.floor(size * 0.7)}px serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(POWER_ICONS[power], cx, cy + 1);
}

function drawMini(context, piece, cell, cx, cy) {
  const shape = piece.shape;
  const ox = cx - (shape[0].length * cell) / 2;
  const oy = cy - (shape.length * cell) / 2;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) drawBlockPx(context, ox + c * cell, oy + r * cell, shape[r][c], cell);
  if (piece.power) drawPowerIcon(context, cx, cy, cell, piece.power);
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  const now = performance.now();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board (en modo invisible solo se muestra brevemente tras cada lock)
  const hideBoard = mode === 'invisible' && now >= boardRevealUntil;
  if (!hideBoard)
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        drawBlock(ctx, c, r, board[r][c], BLOCK);

  // flash de filas limpiadas
  flashRows = flashRows.filter(f => f.until > now);
  for (const f of flashRows) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, f.row * BLOCK, COLS * BLOCK, BLOCK);
  }

  if (current) {
    // ghost
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

    // pieza actual
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

    if (current.power)
      drawPowerIcon(ctx, current.x * BLOCK + BLOCK / 2, current.y * BLOCK + BLOCK / 2, BLOCK, current.power);
  }

  // textos flotantes
  for (const f of floatingTexts) {
    ctx.globalAlpha = Math.max(0, f.alpha);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
}

function drawNext() {
  const revealing = queueRevealed && performance.now() < revealQueueUntil;
  const count = revealing ? Math.min(5, nextQueue.length) : 1;
  const height = revealing ? 72 * count : 90;
  if (nextCanvas.height !== height) nextCanvas.height = height;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  for (let i = 0; i < count; i++) {
    const cell = revealing ? 15 : 20;
    const cy = revealing ? 36 + i * 72 : nextCanvas.height / 2;
    drawMini(nextCtx, nextQueue[i], cell, nextCanvas.width / 2, cy);
  }
}

function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (hold) drawMini(holdCtx, hold, 20, holdCanvas.width / 2, holdCanvas.height / 2);
}

/* ---------- Estados de partida ---------- */

function finishGame(title) {
  gameOver = true;
  cancelAnimationFrame(animId);
  abilityOpen = false;
  abilityMenu.classList.add('hidden');
  overlayTitle.textContent = title;
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  pauseMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function endGame() {
  finishGame('GAME OVER');
  beep(110, 0.4, 'sawtooth');
}

function togglePause() {
  if (gameOver || abilityOpen) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    pauseMenu.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    restartBtn.classList.add('hidden');
    controlsList.classList.add('hidden'); // el menú siempre abre con la lista colapsada
    pauseMenu.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }
}

/* ---------- Bucle principal ---------- */

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;

  // timers de modo
  if (mode === 'sprint') {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      updateObjective(ts);
      draw();
      finishGame('TIEMPO AGOTADO');
      beep(110, 0.4, 'sawtooth');
      return;
    }
  }
  if (mode === 'basura') {
    garbageTimer += dt;
    if (garbageTimer >= GARBAGE_EVERY) {
      garbageTimer -= GARBAGE_EVERY;
      addGarbageRow();
      if (gameOver) { draw(); return; }
    }
  }

  // caída (respeta congelar y ralentizar)
  const frozen = ts < freezeUntil;
  const interval = ts < slowUntil ? dropInterval * 2 : dropInterval;
  if (!frozen) {
    dropAccum += dt;
    if (dropAccum >= interval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
        if (gameOver) { draw(); return; }
      }
    }
  }

  // fin de la revelación de cola
  if (queueRevealed && ts >= revealQueueUntil) {
    queueRevealed = false;
    drawNext();
  }

  updateFloatingTexts(dt);
  updateObjective(ts);
  draw();
  animId = requestAnimationFrame(loop);
}

/* ---------- Init ---------- */

function init() {
  mode = modeSelect.value;
  board = createBoard();
  if (mode === 'obstaculos') placeObstacles();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel;
  level = gameStartLevel;
  combo = 0;
  b2b = false;
  energy = 0;
  hold = null;
  holdUsed = false;
  undoSnapshot = null;
  paused = false;
  gameOver = false;
  abilityOpen = false;
  dropInterval = Math.max(100, 1000 - (gameStartLevel - 1) * 90);
  dropAccum = 0;
  nextPowerupAt = POWER_EVERY;
  freezeUntil = 0;
  slowUntil = 0;
  revealQueueUntil = 0;
  queueRevealed = false;
  boardRevealUntil = performance.now() + 1500;
  lastMoveWasRotation = false;
  floatingTexts = [];
  flashRows = [];
  timeLeft = SPRINT_TIME;
  garbageTimer = 0;
  nextQueue = [];
  refillQueue();
  spawn();
  drawHold();
  updateHUD();
  updateObjective(performance.now());
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  abilityMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

/* ---------- Entrada ---------- */

document.addEventListener('keydown', e => {
  if (abilityOpen) {
    if (e.code === 'Escape') closeAbilityMenu();
    return;
  }
  if (paused) {
    // menú de pausa abierto: bloquear inputs del juego; solo P/Escape reanudan
    if (e.code === 'Space' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' ||
        e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault(); // evita activar botones/selects enfocados del menú
    }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) {
        current.x--;
        lastMoveWasRotation = false;
      }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) {
        current.x++;
        lastMoveWasRotation = false;
      }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      doHold();
      break;
    case 'KeyE':
      openAbilityMenu();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

/* ---------- Menú de pausa ---------- */

resumeBtn.addEventListener('click', () => {
  resumeBtn.blur();
  togglePause();
});

pauseRestartBtn.addEventListener('click', () => {
  pauseRestartBtn.blur();
  init();
});

controlsBtn.addEventListener('click', () => {
  controlsList.classList.toggle('hidden');
  controlsBtn.blur();
});

startLevelSelect.addEventListener('change', () => {
  const val = parseInt(startLevelSelect.value, 10);
  if (val >= 1 && val <= 10) startLevel = val;
  try { localStorage.setItem('tetris.startLevel', String(startLevel)); } catch (e) {}
  startLevelSelect.blur();
});

startLevelSelect.value = String(startLevel);

modeSelect.addEventListener('change', () => {
  modeSelect.blur(); // evita que las flechas cambien el modo durante la partida
  init();
});

abilityMenu.querySelectorAll('button[data-ability]').forEach(btn =>
  btn.addEventListener('click', () => useAbility(btn.dataset.ability))
);
abilityCancel.addEventListener('click', closeAbilityMenu);
abilityMenu.addEventListener('click', e => {
  if (e.target === abilityMenu) closeAbilityMenu();
});

/* ---------- Tema ---------- */

function applyTheme(theme) {
  const light = theme === 'light';
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  themeToggle.textContent = light ? '🌙 Oscuro' : '☀️ Claro';
  // el bucle no corre en pausa/game over: redibujar para actualizar la rejilla
  if (current) { draw(); drawNext(); drawHold(); }
}

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('theme', theme); } catch (e) {}
  applyTheme(theme);
  themeToggle.blur(); // evita que Space active el botón durante la partida
});

applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
init();
