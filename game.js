// ============================================================
// Alligator Escape! - Game
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// --- Config ---
const AIRPLANE_SPEED = 4;
const ALLIGATOR_BASE_SPEED = 1.8;
const ALLIGATOR_ACCEL = 0.0003;
const BANANA_DROP_SPEED = 5;
const BANANA_COOLDOWN = 500;
const BANANA_STUN_DURATION = 2000;
const MAX_BANANAS = 3;
const SCORE_PER_SECOND = 10;
const BANANA_HIT_BONUS = 50;
const GAME_DURATION = 90; // seconds
const GROUND_Y = H * 0.72;

// --- State ---
let state, lastTimestamp, frameCount, audioCtx;

function createState() {
  return {
    airplane: { x: 600, y: 100, w: 60, h: 30 },
    alligator: { x: 100, y: GROUND_Y + 20, w: 70, h: 30, speed: ALLIGATOR_BASE_SPEED, stunTimer: 0, jumpTimer: 0, jumpVy: 0, baseY: GROUND_Y + 20 },
    bananas: [],
    particles: [],
    clouds: [
      { x: 100, y: 60, r: 30 },
      { x: 350, y: 90, r: 25 },
      { x: 600, y: 50, r: 35 },
      { x: 800, y: 110, r: 20 },
    ],
    keys: {},
    score: 0,
    gameTime: 0,
    lastBananaDrop: 0,
    gameOver: false,
    won: false,
    gameStarted: false,
    shakeTimer: 0,
    shakeOffsetX: 0,
    shakeOffsetY: 0,
  };
}

// --- Audio ---
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, duration, type = 'square', volume = 0.1) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playDropSound() { playTone(600, 0.1, 'sine'); }
function playHitSound() { playTone(200, 0.3, 'square'); playTone(150, 0.4, 'sawtooth', 0.05); }
function playGameOverSound() {
  playTone(400, 0.15, 'square');
  setTimeout(() => playTone(300, 0.15, 'square'), 150);
  setTimeout(() => playTone(200, 0.3, 'square'), 300);
}
function playWinSound() {
  playTone(400, 0.15, 'sine');
  setTimeout(() => playTone(500, 0.15, 'sine'), 150);
  setTimeout(() => playTone(600, 0.15, 'sine'), 300);
  setTimeout(() => playTone(800, 0.4, 'sine'), 450);
}

// --- Input ---
document.addEventListener('keydown', (e) => {
  if (!state) return;
  state.keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
});
document.addEventListener('keyup', (e) => {
  if (!state) return;
  state.keys[e.code] = false;
});

// --- Collision ---
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// --- Particles ---
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * (2 + Math.random() * 2),
      vy: Math.sin(angle) * (2 + Math.random() * 2),
      life: 1,
      color,
      r: 3 + Math.random() * 3,
    });
  }
}

// --- Update ---
function update(dt) {
  if (state.gameOver) return;

  state.gameTime += dt;
  const elapsed = state.gameTime / 1000;
  const remaining = GAME_DURATION - elapsed;

  // Win condition
  if (remaining <= 0) {
    state.won = true;
    state.gameOver = true;
    playWinSound();
    showEndScreen();
    return;
  }

  // Score
  state.score += (SCORE_PER_SECOND * dt) / 1000;

  // --- Airplane movement ---
  const k = state.keys;
  let dx = 0, dy = 0;
  if (k['ArrowLeft'] || k['KeyA']) dx -= 1;
  if (k['ArrowRight'] || k['KeyD']) dx += 1;
  if (k['ArrowUp'] || k['KeyW']) dy -= 1;
  if (k['ArrowDown'] || k['KeyS']) dy += 1;

  if (dx !== 0 && dy !== 0) {
    const norm = 1 / Math.SQRT2;
    dx *= norm;
    dy *= norm;
  }

  const plane = state.airplane;
  plane.x += dx * AIRPLANE_SPEED;
  plane.y += dy * AIRPLANE_SPEED;

  // Clamp airplane to upper area
  plane.x = Math.max(0, Math.min(W - plane.w, plane.x));
  plane.y = Math.max(0, Math.min(GROUND_Y - plane.h - 10, plane.y));

  // Bobbing
  plane.y += Math.sin(frameCount * 0.05) * 0.4;

  // --- Banana drop ---
  if (k['Space'] && Date.now() - state.lastBananaDrop > BANANA_COOLDOWN && state.bananas.length < MAX_BANANAS) {
    state.bananas.push({ x: plane.x + plane.w / 2 - 8, y: plane.y + plane.h, w: 16, h: 20 });
    state.lastBananaDrop = Date.now();
    playDropSound();
  }

  // --- Update bananas ---
  for (let i = state.bananas.length - 1; i >= 0; i--) {
    const b = state.bananas[i];
    b.y += BANANA_DROP_SPEED;

    // Hit alligator
    if (aabb(b, state.alligator) && state.alligator.stunTimer <= 0) {
      state.alligator.stunTimer = BANANA_STUN_DURATION;
      state.score += BANANA_HIT_BONUS;
      spawnParticles(b.x + b.w / 2, b.y + b.h / 2, '#FFD700', 10);
      playHitSound();
      state.bananas.splice(i, 1);
      continue;
    }

    // Off screen
    if (b.y > H) {
      state.bananas.splice(i, 1);
    }
  }

  // --- Alligator ---
  const gator = state.alligator;

  if (gator.stunTimer > 0) {
    gator.stunTimer -= dt;
  } else {
    // Speed ramp
    gator.speed = ALLIGATOR_BASE_SPEED + (state.gameTime / 1000) * ALLIGATOR_ACCEL * 100;

    // Chase airplane x
    const dir = Math.sign(plane.x + plane.w / 2 - (gator.x + gator.w / 2));
    gator.x += dir * gator.speed;

    // Clamp
    gator.x = Math.max(0, Math.min(W - gator.w, gator.x));

    // Jump logic
    gator.jumpTimer -= dt;
    const hDist = Math.abs(plane.x + plane.w / 2 - (gator.x + gator.w / 2));
    if (gator.jumpTimer <= 0 && hDist < 150 && gator.y >= gator.baseY - 1) {
      gator.jumpVy = -8;
      gator.jumpTimer = 3000 + Math.random() * 2000;
    }
  }

  // Jump physics (even while stunned, finish the arc)
  if (gator.jumpVy !== 0 || gator.y < gator.baseY) {
    gator.y += gator.jumpVy;
    gator.jumpVy += 0.35; // gravity
    if (gator.y >= gator.baseY) {
      gator.y = gator.baseY;
      gator.jumpVy = 0;
    }
  }

  // --- Airplane-Alligator collision ---
  if (aabb(plane, gator)) {
    state.gameOver = true;
    state.shakeTimer = 300;
    playGameOverSound();
    showEndScreen();
    return;
  }

  // --- Particles ---
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.02;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  // --- Clouds ---
  const cloudSpeed = remaining < 15 ? 1.5 : 0.5;
  for (const c of state.clouds) {
    c.x -= cloudSpeed;
    if (c.x + c.r * 2 < 0) {
      c.x = W + c.r;
      c.y = 40 + Math.random() * 80;
    }
  }

  // --- Screen shake ---
  if (state.shakeTimer > 0) {
    state.shakeTimer -= dt;
    state.shakeOffsetX = (Math.random() - 0.5) * 8;
    state.shakeOffsetY = (Math.random() - 0.5) * 8;
  } else {
    state.shakeOffsetX = 0;
    state.shakeOffsetY = 0;
  }
}

// --- Drawing ---
function drawBackground() {
  const elapsed = state.gameTime / 1000;
  const remaining = GAME_DURATION - elapsed;

  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  if (remaining < 15) {
    const urgency = 1 - remaining / 15;
    const r = Math.floor(135 + urgency * 80);
    const g = Math.floor(206 - urgency * 80);
    const b = Math.floor(235 - urgency * 80);
    grad.addColorStop(0, `rgb(${r},${g},${b})`);
    grad.addColorStop(1, `rgb(${Math.min(255, 240 + urgency * 15)},${Math.max(180, 230 - urgency * 50)},${Math.max(180, 230 - urgency * 50)})`);
  } else {
    grad.addColorStop(0, '#87CEEB');
    grad.addColorStop(1, '#E8F4FD');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Clouds
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (const c of state.clouds) {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.r * 1.5, c.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x - c.r, c.y + 5, c.r, c.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x + c.r, c.y + 5, c.r * 0.8, c.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground
  const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  groundGrad.addColorStop(0, '#4CAF50');
  groundGrad.addColorStop(1, '#2E7D32');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // Ground line
  ctx.strokeStyle = '#388E3C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(W, GROUND_Y);
  ctx.stroke();
}

function drawAirplane() {
  const p = state.airplane;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;

  ctx.save();
  ctx.translate(cx, cy);

  // Body
  ctx.fillStyle = '#B0BEC5';
  ctx.beginPath();
  ctx.ellipse(0, 0, p.w / 2, p.h / 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#78909C';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cockpit window
  ctx.fillStyle = '#E53935';
  ctx.beginPath();
  ctx.arc(p.w / 2 - 10, -2, 5, 0, Math.PI * 2);
  ctx.fill();

  // Top wing
  ctx.fillStyle = '#90A4AE';
  ctx.beginPath();
  ctx.moveTo(-5, -p.h / 3);
  ctx.lineTo(-15, -p.h / 3 - 14);
  ctx.lineTo(15, -p.h / 3 - 14);
  ctx.lineTo(5, -p.h / 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#78909C';
  ctx.stroke();

  // Bottom wing
  ctx.beginPath();
  ctx.moveTo(-5, p.h / 3);
  ctx.lineTo(-15, p.h / 3 + 14);
  ctx.lineTo(15, p.h / 3 + 14);
  ctx.lineTo(5, p.h / 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.fillStyle = '#90A4AE';
  ctx.beginPath();
  ctx.moveTo(-p.w / 2, 0);
  ctx.lineTo(-p.w / 2 - 10, -12);
  ctx.lineTo(-p.w / 2 - 5, 0);
  ctx.lineTo(-p.w / 2 - 10, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Propeller
  const propAngle = frameCount * 0.4;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.w / 2 + Math.cos(propAngle) * 12, Math.sin(propAngle) * 12);
  ctx.lineTo(p.w / 2 - Math.cos(propAngle) * 12, -Math.sin(propAngle) * 12);
  ctx.stroke();

  ctx.restore();
}

function drawAlligator() {
  const g = state.alligator;
  const stunned = g.stunTimer > 0;

  ctx.save();
  ctx.translate(g.x, g.y);

  // Direction facing airplane
  const facingRight = (state.airplane.x + state.airplane.w / 2) > (g.x + g.w / 2);
  if (!facingRight) {
    ctx.translate(g.w, 0);
    ctx.scale(-1, 1);
  }

  // Body
  ctx.fillStyle = stunned && Math.floor(frameCount / 4) % 2 === 0 ? '#A5D6A7' : '#4CAF50';
  ctx.beginPath();
  ctx.ellipse(g.w / 2, g.h / 2, g.w / 2, g.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Snout
  ctx.fillStyle = stunned && Math.floor(frameCount / 4) % 2 === 0 ? '#81C784' : '#388E3C';
  ctx.beginPath();
  ctx.ellipse(g.w + 5, g.h / 2, 15, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Teeth
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(g.w - 2 + i * 6, g.h / 2 + 5);
    ctx.lineTo(g.w + 1 + i * 6, g.h / 2 + 10);
    ctx.lineTo(g.w + 4 + i * 6, g.h / 2 + 5);
    ctx.closePath();
    ctx.fill();
  }

  // Eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(g.w / 2 + 10, g.h / 2 - 10, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(g.w / 2 + 12, g.h / 2 - 10, 3, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#388E3C';
  ctx.fillRect(8, g.h - 2, 8, 10);
  ctx.fillRect(g.w - 16, g.h - 2, 8, 10);

  // Stun stars
  if (stunned) {
    ctx.fillStyle = '#FFD700';
    ctx.font = '16px serif';
    const wobble = Math.sin(frameCount * 0.2) * 5;
    ctx.fillText('\u2605', g.w / 2 - 15 + wobble, -10);
    ctx.fillText('\u2605', g.w / 2 + 10 - wobble, -5);
    ctx.fillText('\u2605', g.w / 2 - 5, -15 + wobble);
  }

  ctx.restore();
}

function drawBanana(b) {
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);

  // Banana shape
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(0, 0, 8, Math.PI * 0.2, Math.PI * 0.8, false);
  ctx.arc(0, -3, 8, Math.PI * 0.8, Math.PI * 0.2, true);
  ctx.closePath();
  ctx.fill();

  // Stem
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(5, -6);
  ctx.lineTo(7, -10);
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  const elapsed = state.gameTime / 1000;
  const remaining = Math.max(0, Math.ceil(GAME_DURATION - elapsed));

  // Score
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.fillText(`Score: ${Math.floor(state.score)}`, 15, 30);

  // Timer
  ctx.textAlign = 'right';
  ctx.fillStyle = remaining <= 15 ? '#FF5252' : '#fff';
  ctx.fillText(`Time: ${remaining}s`, W - 15, 30);

  // Banana count
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD700';
  ctx.font = '18px monospace';
  const bananaText = '\uD83C\uDF4C'.repeat(MAX_BANANAS - state.bananas.length);
  ctx.fillText(bananaText, W / 2, 30);

  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
}

// --- Render ---
function render() {
  ctx.save();
  ctx.translate(state.shakeOffsetX, state.shakeOffsetY);

  drawBackground();

  // Draw bananas
  for (const b of state.bananas) {
    drawBanana(b);
  }

  // Draw alligator
  drawAlligator();

  // Draw airplane
  drawAirplane();

  // Draw particles
  drawParticles();

  // Draw HUD
  drawHUD();

  ctx.restore();
}

// --- Game loop ---
function gameLoop(timestamp) {
  const dt = Math.min(timestamp - lastTimestamp, 50); // cap delta to avoid huge jumps
  lastTimestamp = timestamp;
  frameCount++;

  update(dt);
  render();

  if (!state.gameOver) {
    requestAnimationFrame(gameLoop);
  } else if (state.shakeTimer > 0) {
    // Continue rendering during shake
    requestAnimationFrame(gameLoop);
  }
}

// --- End screen ---
function showEndScreen() {
  const overlay = document.getElementById('gameOverOverlay');
  const title = document.getElementById('endTitle');
  const msg = document.getElementById('endMessage');
  const score = document.getElementById('finalScore');

  if (state.won) {
    title.textContent = 'You Escaped!';
    msg.textContent = 'The alligator could not catch you!';
  } else {
    title.textContent = 'Game Over!';
    msg.textContent = 'The alligator got you!';
  }
  score.textContent = `Final Score: ${Math.floor(state.score)}`;

  // Small delay so shake can finish
  setTimeout(() => {
    overlay.classList.remove('hidden');
  }, state.won ? 0 : 350);
}

// --- Init ---
function init() {
  state = createState();
  frameCount = 0;
  lastTimestamp = 0;
}

function startGame() {
  initAudio();
  init();
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('gameOverOverlay').classList.add('hidden');
  state.gameStarted = true;
  lastTimestamp = performance.now();
  requestAnimationFrame(gameLoop);
}

// --- Wiring ---
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

// Initial state for background render
init();
render();
