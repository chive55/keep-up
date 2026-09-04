const BEST_KEY = 'keep-up-best';

type Screen = 'title' | 'playing' | 'paused' | 'gameover';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  vy: number;
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;
const scoreEl = document.getElementById('score')!;
const comboEl = document.getElementById('combo')!;
const bestEl = document.getElementById('best')!;
const overlay = document.getElementById('overlay')!;
const titleScreen = document.getElementById('title-screen')!;
const pauseScreen = document.getElementById('pause-screen')!;
const gameoverScreen = document.getElementById('gameover-screen')!;
const finalScoreEl = document.getElementById('final-score')!;
const finalBestEl = document.getElementById('final-best')!;
const btnBegin = document.getElementById('btn-begin')!;
const btnResume = document.getElementById('btn-resume')!;
const btnAgain = document.getElementById('btn-again')!;

let W = 0;
let H = 0;
let dpr = 1;

function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  W = rect.width;
  H = rect.height;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let screen: Screen = 'title';
let score = 0;
let best = Number(localStorage.getItem(BEST_KEY) || '0') || 0;
let combo = 0;
let comboTimer = 0;
let multiplier = 1;

const COMBO_WINDOW = 1.35;
const HIT_HALF_WIDTH_FACTOR = 1.55;

let ballX = 0;
let ballY = 0;
let ballVX = 0;
let ballVY = 0;
let ballR = 22;
let gravity = 980;
let bumpStrength = 620;
let elapsed = 0;

const particles: Particle[] = [];
const floatTexts: FloatText[] = [];
let squash = 1;
let squashVel = 0;
let trail: { x: number; y: number; a: number }[] = [];
let floorPulse = 0;
let missFlash = 0;
let lastTs = 0;
let raf = 0;

function loadBest(): void {
  best = Number(localStorage.getItem(BEST_KEY) || '0') || 0;
  bestEl.textContent = 'Best ' + best;
}

function saveBest(): void {
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
  }
  bestEl.textContent = 'Best ' + best;
}

function setScreen(next: Screen): void {
  screen = next;
  titleScreen.classList.toggle('hidden', next !== 'title');
  pauseScreen.classList.toggle('hidden', next !== 'paused');
  gameoverScreen.classList.toggle('hidden', next !== 'gameover');
  const showOverlay = next === 'title' || next === 'paused' || next === 'gameover';
  overlay.classList.toggle('hidden', !showOverlay);
  hud.classList.toggle('hidden', next === 'title');
}

function resetBall(): void {
  ballR = Math.max(18, Math.min(W, H) * 0.055);
  ballX = W * 0.5;
  ballY = H * 0.38;
  ballVX = (Math.random() - 0.5) * 40;
  ballVY = -80;
  gravity = 720;
  bumpStrength = 560;
  elapsed = 0;
  squash = 1;
  squashVel = 0;
  trail = [];
}

function startGame(): void {
  score = 0;
  combo = 0;
  comboTimer = 0;
  multiplier = 1;
  particles.length = 0;
  floatTexts.length = 0;
  missFlash = 0;
  floorPulse = 0;
  scoreEl.textContent = '0';
  comboEl.classList.add('hidden');
  comboEl.textContent = '';
  loadBest();
  resetBall();
  setScreen('playing');
  lastTs = performance.now();
}

function gameOver(): void {
  saveBest();
  finalScoreEl.textContent = String(score);
  finalBestEl.textContent = 'Best ' + best;
  setScreen('gameover');
  spawnBurst(ballX, ballY, 28, 200);
}

function updateHudCombo(): void {
  if (combo >= 2) {
    comboEl.textContent = 'x' + multiplier + ' · ' + combo + ' streak';
    comboEl.classList.remove('hidden');
    comboEl.classList.remove('pop');
    void comboEl.offsetWidth;
    comboEl.classList.add('pop');
  } else {
    comboEl.classList.add('hidden');
  }
}

function spawnBurst(x: number, y: number, n: number, hueBase: number): void {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 80 + Math.random() * 220;
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 60,
      life: 0.35 + Math.random() * 0.45,
      maxLife: 0.35 + Math.random() * 0.45,
      size: 2 + Math.random() * 4,
      hue: hueBase + Math.random() * 40,
    });
  }
}

function spawnFloat(x: number, y: number, text: string): void {
  floatTexts.push({
    x,
    y,
    text,
    life: 0.7,
    maxLife: 0.7,
    vy: -55,
  });
}

function tryBump(clientX: number | null): boolean {
  if (screen !== 'playing') return false;

  let tapX: number;
  if (clientX === null) {
    tapX = ballX;
  } else {
    const rect = canvas.getBoundingClientRect();
    tapX = clientX - rect.left;
  }

  const hitHalf = ballR * HIT_HALF_WIDTH_FACTOR + W * 0.06;
  if (Math.abs(tapX - ballX) > hitHalf) {
    missFlash = 0.18;
    return false;
  }

  // Soft aim: bump slightly toward/away based on tap offset
  const offset = (tapX - ballX) / hitHalf;
  const upward = bumpStrength + Math.min(180, Math.abs(ballVY) * 0.15);
  ballVY = -upward;
  ballVX += offset * -90;
  ballVX *= 0.85;
  // Clamp horizontal speed
  const maxVX = 280 + elapsed * 8;
  ballVX = Math.max(-maxVX, Math.min(maxVX, ballVX));

  squash = 0.72;
  squashVel = 3.2;

  comboTimer = COMBO_WINDOW;
  combo += 1;
  multiplier = Math.min(5, 1 + Math.floor((combo - 1) / 3));
  const gained = multiplier;
  score += gained;
  scoreEl.textContent = String(score);
  if (score > best) {
    best = score;
    bestEl.textContent = 'Best ' + best;
  }
  updateHudCombo();

  spawnBurst(ballX, ballY + ballR * 0.3, 10 + Math.min(combo, 12), 190);
  if (multiplier > 1) {
    spawnFloat(ballX, ballY - ballR, '+' + gained);
  } else {
    spawnFloat(ballX, ballY - ballR, '+1');
  }
  return true;
}

function update(dt: number): void {
  if (screen !== 'playing') return;

  elapsed += dt;

  // Slow difficulty ramp — gentle on wave 1
  gravity = 720 + Math.min(420, elapsed * 14);
  bumpStrength = 560 + Math.min(160, elapsed * 6);

  ballVY += gravity * dt;
  ballX += ballVX * dt;
  ballY += ballVY * dt;

  // Soft walls
  const pad = ballR + 4;
  if (ballX < pad) {
    ballX = pad;
    ballVX = Math.abs(ballVX) * 0.75;
  } else if (ballX > W - pad) {
    ballX = W - pad;
    ballVX = -Math.abs(ballVX) * 0.75;
  }

  // Ceiling soft bounce
  if (ballY < ballR + 8) {
    ballY = ballR + 8;
    if (ballVY < 0) ballVY *= -0.35;
  }

  // Floor = game over
  if (ballY + ballR >= H - 4) {
    ballY = H - 4 - ballR;
    floorPulse = 1;
    gameOver();
    return;
  }

  // Combo decay
  if (combo > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      combo = 0;
      multiplier = 1;
      comboTimer = 0;
      updateHudCombo();
    }
  }

  // Squash spring
  squashVel += (1 - squash) * 28 * dt;
  squashVel *= Math.exp(-8 * dt);
  squash += squashVel * dt;

  // Trail
  trail.push({ x: ballX, y: ballY, a: 1 });
  if (trail.length > 12) trail.shift();
  for (const t of trail) t.a *= 0.86;

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 400 * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i]!;
    f.life -= dt;
    f.y += f.vy * dt;
    if (f.life <= 0) floatTexts.splice(i, 1);
  }

  if (missFlash > 0) missFlash -= dt;
  if (floorPulse > 0) floorPulse -= dt * 2;
}

function drawBackground(): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0c0c14');
  g.addColorStop(1, '#12121c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // subtle vignette circles
  ctx.fillStyle = 'rgba(99, 102, 241, 0.04)';
  ctx.beginPath();
  ctx.arc(W * 0.5, H * 0.25, W * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // floor line
  const fy = H - 3;
  ctx.strokeStyle = floorPulse > 0
    ? 'rgba(248, 113, 113, ' + (0.35 + floorPulse * 0.5) + ')'
    : 'rgba(232, 232, 240, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, fy);
  ctx.lineTo(W - 16, fy);
  ctx.stroke();
}

function drawBall(): void {
  // trail
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i]!;
    const r = ballR * (0.35 + (i / trail.length) * 0.45);
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(165, 180, 252, ' + (t.a * 0.18) + ')';
    ctx.fill();
  }

  const sy = squash;
  const sx = 2 - squash;
  ctx.save();
  ctx.translate(ballX, ballY);
  ctx.scale(sx, sy);

  // glow
  const glow = ctx.createRadialGradient(0, 0, ballR * 0.2, 0, 0, ballR * 1.8);
  glow.addColorStop(0, 'rgba(125, 211, 252, 0.35)');
  glow.addColorStop(1, 'rgba(125, 211, 252, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, ballR * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // ball body
  const body = ctx.createRadialGradient(-ballR * 0.35, -ballR * 0.4, ballR * 0.1, 0, 0, ballR);
  body.addColorStop(0, '#f8fafc');
  body.addColorStop(0.45, '#a5b4fc');
  body.addColorStop(1, '#6366f1');
  ctx.beginPath();
  ctx.arc(0, 0, ballR, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  // highlight
  ctx.beginPath();
  ctx.ellipse(-ballR * 0.28, -ballR * 0.32, ballR * 0.22, ballR * 0.14, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  ctx.restore();

  // generous hit zone hint when falling slowly near bottom (early game teaching)
  if (screen === 'playing' && ballVY > 80 && ballY > H * 0.55 && elapsed < 12) {
    const half = ballR * HIT_HALF_WIDTH_FACTOR + W * 0.06;
    ctx.fillStyle = 'rgba(125, 211, 252, 0.06)';
    ctx.fillRect(ballX - half, H - 28, half * 2, 10);
  }
}

function drawFx(): void {
  for (const p of particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(' + p.hue + ', 85%, 70%, ' + a + ')';
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.font = '700 16px system-ui, sans-serif';
  for (const f of floatTexts) {
    const a = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = 'rgba(125, 211, 252, ' + a + ')';
    ctx.fillText(f.text, f.x, f.y);
  }

  if (missFlash > 0) {
    ctx.fillStyle = 'rgba(248, 113, 113, ' + (missFlash * 0.12) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawIdlePreview(): void {
  // gentle floating ball on title
  const t = performance.now() / 1000;
  const x = W * 0.5;
  const y = H * 0.42 + Math.sin(t * 1.4) * 14;
  const r = Math.max(18, Math.min(W, H) * 0.055);
  ctx.save();
  ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.8);
  glow.addColorStop(0, 'rgba(125, 211, 252, 0.28)');
  glow.addColorStop(1, 'rgba(125, 211, 252, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#f8fafc');
  body.addColorStop(0.45, '#a5b4fc');
  body.addColorStop(1, '#6366f1');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();
}

function frame(ts: number): void {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;

  if (screen === 'playing') update(dt);

  drawBackground();
  if (screen === 'title') {
    drawIdlePreview();
  } else {
    drawBall();
    drawFx();
  }
}

function onPointer(e: PointerEvent): void {
  if (screen !== 'playing') return;
  e.preventDefault();
  tryBump(e.clientX);
}

function onKey(e: KeyboardEvent): void {
  if (e.code === 'Space') {
    e.preventDefault();
    if (screen === 'title') startGame();
    else if (screen === 'gameover') startGame();
    else if (screen === 'playing') tryBump(null);
    else if (screen === 'paused') {
      setScreen('playing');
      lastTs = performance.now();
    }
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (screen === 'playing') setScreen('paused');
    else if (screen === 'paused') {
      setScreen('playing');
      lastTs = performance.now();
    }
  }
}

btnBegin.addEventListener('click', () => startGame());
btnResume.addEventListener('click', () => {
  setScreen('playing');
  lastTs = performance.now();
});
btnAgain.addEventListener('click', () => startGame());

canvas.addEventListener('pointerdown', onPointer);
window.addEventListener('keydown', onKey);
window.addEventListener('resize', () => {
  resize();
  if (screen === 'title') {
    // ok
  } else if (ballR > 0) {
    ballR = Math.max(18, Math.min(W, H) * 0.055);
  }
});

// Prevent scroll / pull-to-refresh on mobile
document.body.addEventListener(
  'touchmove',
  (e) => {
    e.preventDefault();
  },
  { passive: false },
);

loadBest();
resize();
setScreen('title');
lastTs = performance.now();
raf = requestAnimationFrame(frame);

// silence unused in case of tree weirdness
void raf;
