// ============================================================
// Jungle Air Command - Complete Game
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// --- Config ---
const GROUND_Y = Math.floor(H * 0.75);
const GAME_DURATION = 120;
const AIRPLANE_SPEED = 2.8;
const ALLIGATOR_BASE_SPEED = 1.2;
const ALLIGATOR_ACCEL = 0.0002;
const BANANA_DROP_SPEED = 3.5;
const BANANA_COOLDOWN = 600;
const BANANA_STUN_DURATION = 2500;
const MAX_BANANAS = 5;
const COCONUT_COOLDOWN = 2000;
const COCONUT_SPEED = 3;
const COCONUT_RANGE = 200;
const COCONUT_BLAST = 60;
const VINE_COOLDOWN = 8000;
const VINE_DURATION = 3000;
const SCORE_PER_SECOND = 10;
const BANANA_HIT_BONUS = 50;
const ENEMY_KILL_BONUS = 25;
const WAVE_INTERVAL = 12000;
const MAX_ALLIES = 5;
const INVULN_TIME = 1500;
const MAX_HP = 5;

const ALLY_COSTS = { fighter: 100, bomber: 200, healer: 150 };

// --- Audio ---
let audioCtx;
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function playTone(freq, dur, type = 'square', vol = 0.08) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
}
function playDropSound() { playTone(600, 0.1, 'sine'); }
function playHitSound() { playTone(200, 0.2, 'square'); }
function playExplosionSound() { playTone(80, 0.4, 'sawtooth', 0.12); playTone(60, 0.5, 'square', 0.06); }
function playPowerupSound() { playTone(500, 0.1, 'sine'); setTimeout(() => playTone(700, 0.1, 'sine'), 100); setTimeout(() => playTone(900, 0.15, 'sine'), 200); }
function playBuildSound() { playTone(400, 0.05, 'square'); setTimeout(() => playTone(600, 0.08, 'square'), 60); }
function playDamageSound() { playTone(150, 0.2, 'sawtooth', 0.1); playTone(100, 0.3, 'square', 0.06); }
function playGameOverSound() { playTone(400, 0.15, 'square'); setTimeout(() => playTone(300, 0.15, 'square'), 150); setTimeout(() => playTone(200, 0.3, 'square'), 300); }
function playWinSound() { playTone(400, 0.12, 'sine'); setTimeout(() => playTone(500, 0.12, 'sine'), 120); setTimeout(() => playTone(600, 0.12, 'sine'), 240); setTimeout(() => playTone(800, 0.3, 'sine'), 360); }

// --- State ---
let state, lastTimestamp, frameCount;

function createAlligator(x) {
  return {
    x: x, y: GROUND_Y + 15, w: 80, h: 35,
    speed: ALLIGATOR_BASE_SPEED, stunTimer: 0,
    jumpTimer: 2000 + Math.random() * 2000, jumpVy: 0, baseY: GROUND_Y + 15,
    boostLevel: 0 // how many gators stacked beneath when jumping
  };
}

function createState() {
  return {
    airplane: { x: 200, y: 150, w: 60, h: 30 },
    alligators: [createAlligator(100)],
    hp: MAX_HP,
    gold: 50,
    coconuts: 3,
    vineCharges: 1,
    shield: false,
    speedBoostTimer: 0,
    rapidFireTimer: 0,
    invulnTimer: 0,
    bananas: [],
    coconutBombs: [],
    enemies: [],
    enemyBullets: [],
    allies: [],
    allyBullets: [],
    powerups: [],
    particles: [],
    keys: {},
    score: 0,
    gameTime: 0,
    lastBananaDrop: 0,
    lastCoconutDrop: 0,
    lastVineUse: 0,
    vineActiveTimer: 0,
    waveTimer: 0,
    waveNumber: 0,
    gameOver: false,
    won: false,
    gameStarted: false,
    shakeTimer: 0,
    shakeX: 0,
    shakeY: 0,
    bgOffset: 0,
    midOffset: 0,
    fireflies: Array.from({ length: 10 }, () => ({
      x: Math.random() * W, y: Math.random() * (GROUND_Y - 50),
      phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.5
    })),
    clouds: [
      { x: 100, y: 50, r: 28 }, { x: 320, y: 80, r: 22 },
      { x: 560, y: 40, r: 32 }, { x: 780, y: 95, r: 18 }
    ],
    stats: { enemiesKilled: 0, alliesBuilt: 0, goldEarned: 0, waveReached: 0, powerupsCollected: 0 }
  };
}

// --- Input ---
document.addEventListener('keydown', (e) => {
  if (!state) return;
  state.keys[e.code] = true;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE','KeyQ','Digit1','Digit2','Digit3'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', (e) => { if (state) state.keys[e.code] = false; });

// --- Helpers ---
function aabb(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function dist(a, b) { return Math.hypot((a.x + a.w/2) - (b.x + b.w/2), (a.y + a.h/2) - (b.y + b.h/2)); }
function angleToward(from, to) { return Math.atan2((to.y + to.h/2) - (from.y + from.h/2), (to.x + to.w/2) - (from.x + from.w/2)); }

function spawnParticles(x, y, color, count, sizeMin, sizeMax) {
  sizeMin = sizeMin || 2; sizeMax = sizeMax || 5;
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count;
    state.particles.push({ x, y, vx: Math.cos(a) * (1.5 + Math.random() * 2), vy: Math.sin(a) * (1.5 + Math.random() * 2), life: 1, color, r: sizeMin + Math.random() * (sizeMax - sizeMin) });
  }
}

// --- Wave Spawning ---
function spawnWave() {
  state.waveNumber++;
  state.stats.waveReached = state.waveNumber;
  const wn = state.waveNumber;
  let toSpawn = [];

  if (wn <= 2) {
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) toSpawn.push('mosquito');
  } else if (wn <= 4) {
    for (let i = 0; i < 3; i++) toSpawn.push('mosquito');
    for (let i = 0; i < 2; i++) toSpawn.push('toucan');
  } else if (wn <= 6) {
    for (let i = 0; i < 2; i++) toSpawn.push('mosquito');
    for (let i = 0; i < 2; i++) toSpawn.push('toucan');
    toSpawn.push('enemyPlane');
  } else {
    for (let i = 0; i < 2; i++) toSpawn.push('toucan');
    for (let i = 0; i < 2; i++) toSpawn.push('enemyPlane');
    if (wn % 3 === 0) toSpawn.push('crocCopter');
  }

  const enemyDefs = {
    mosquito:   { w: 20, h: 20, hp: 1, speed: 1.0, color: '#7B1FA2', gold: 10, shootInterval: 0 },
    toucan:     { w: 35, h: 25, hp: 2, speed: 0.7, color: '#FF6F00', gold: 20, shootInterval: 3000 },
    enemyPlane: { w: 50, h: 25, hp: 4, speed: 0.5, color: '#B71C1C', gold: 35, shootInterval: 2500 },
    crocCopter: { w: 60, h: 40, hp: 8, speed: 0.3, color: '#1B5E20', gold: 75, shootInterval: 3000 }
  };

  toSpawn.forEach((type, i) => {
    const d = enemyDefs[type];
    state.enemies.push({
      type, x: W + 50 + i * 70, y: 30 + Math.random() * (GROUND_Y - 90),
      w: d.w, h: d.h, hp: d.hp, maxHp: d.hp, speed: d.speed, color: d.color,
      gold: d.gold, shootTimer: d.shootInterval * Math.random(), shootInterval: d.shootInterval,
      phase: Math.random() * Math.PI * 2
    });
  });

  // Spawn additional alligators at later waves
  if (wn >= 4 && state.alligators.length < Math.min(2 + Math.floor((wn - 4) / 2), 5)) {
    const newX = Math.random() < 0.5 ? -60 : W + 60;
    state.alligators.push(createAlligator(newX));
  }
}

// --- Enemy Shooting ---
function enemyShoot(e) {
  const a = angleToward(e, state.airplane);
  const spd = 2.5;
  if (e.type === 'crocCopter') {
    for (let off = -0.25; off <= 0.25; off += 0.25) {
      state.enemyBullets.push({ x: e.x, y: e.y + e.h / 2, vx: Math.cos(a + off) * spd, vy: Math.sin(a + off) * spd, w: 6, h: 6 });
    }
  } else {
    state.enemyBullets.push({ x: e.x, y: e.y + e.h / 2, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, w: 6, h: 6 });
  }
}

// --- Build Ally ---
function buildAlly(type) {
  if (state.allies.length >= MAX_ALLIES) return;
  const cost = ALLY_COSTS[type];
  if (state.gold < cost) return;
  state.gold -= cost;
  state.stats.alliesBuilt++;
  const p = state.airplane;
  const defs = {
    fighter: { w: 40, h: 20, hp: 3, speed: 2, shootInterval: 1500, color: '#689F38', damage: 1 },
    bomber:  { w: 45, h: 22, hp: 4, speed: 1.5, shootInterval: 2500, color: '#33691E', damage: 2 },
    healer:  { w: 35, h: 18, hp: 2, speed: 1, shootInterval: 5000, color: '#E0E0E0', damage: 0 }
  };
  const d = defs[type];
  state.allies.push({
    type, x: p.x - 50, y: p.y + 30, w: d.w, h: d.h, hp: d.hp, maxHp: d.hp,
    speed: d.speed, shootTimer: 0, shootInterval: d.shootInterval, color: d.color,
    damage: d.damage, angle: Math.random() * Math.PI * 2
  });
  playBuildSound();
}

// --- Powerup Spawning ---
function maybeSpawnPowerup(x, y) {
  if (Math.random() > 0.25) return;
  const types = ['shield', 'speedBoost', 'rapidFire', 'health', 'coconutAmmo', 'vineCharge', 'goldCrate'];
  const colors = { shield: '#42A5F5', speedBoost: '#FFEE58', rapidFire: '#EF5350', health: '#66BB6A', coconutAmmo: '#8D6E63', vineCharge: '#2E7D32', goldCrate: '#FFD700' };
  const type = types[Math.floor(Math.random() * types.length)];
  state.powerups.push({ x, y, w: 22, h: 22, type, color: colors[type], life: 8000, vy: 0.8, vx: -0.3 });
}

function collectPowerup(pu) {
  state.stats.powerupsCollected++;
  playPowerupSound();
  spawnParticles(pu.x + pu.w/2, pu.y + pu.h/2, pu.color, 6);
  switch (pu.type) {
    case 'shield': state.shield = true; break;
    case 'speedBoost': state.speedBoostTimer = 6000; break;
    case 'rapidFire': state.rapidFireTimer = 6000; break;
    case 'health': state.hp = Math.min(MAX_HP, state.hp + 1); break;
    case 'coconutAmmo': state.coconuts += 2; break;
    case 'vineCharge': state.vineCharges += 1; break;
    case 'goldCrate': state.gold += 50; state.stats.goldEarned += 50; break;
  }
}

// --- Player Damage ---
function damagePlayer() {
  if (state.invulnTimer > 0) return;
  if (state.shield) { state.shield = false; spawnParticles(state.airplane.x + 30, state.airplane.y + 15, '#42A5F5', 8); return; }
  state.hp--;
  state.invulnTimer = INVULN_TIME;
  state.shakeTimer = 200;
  playDamageSound();
  if (state.hp <= 0) {
    state.gameOver = true;
    state.shakeTimer = 400;
    playGameOverSound();
    showEndScreen();
  }
}

// ============================================================
// UPDATE
// ============================================================
function update(dt) {
  if (state.gameOver) return;
  state.gameTime += dt;
  const elapsed = state.gameTime / 1000;
  const remaining = GAME_DURATION - elapsed;

  // Win
  if (remaining <= 0) { state.won = true; state.gameOver = true; playWinSound(); showEndScreen(); return; }

  state.score += (SCORE_PER_SECOND * dt) / 1000;
  state.bgOffset += 0.2;
  state.midOffset += 0.5;

  // Timers
  if (state.invulnTimer > 0) state.invulnTimer -= dt;
  if (state.speedBoostTimer > 0) state.speedBoostTimer -= dt;
  if (state.rapidFireTimer > 0) state.rapidFireTimer -= dt;
  if (state.vineActiveTimer > 0) state.vineActiveTimer -= dt;
  if (state.shakeTimer > 0) { state.shakeTimer -= dt; state.shakeX = (Math.random()-0.5)*8; state.shakeY = (Math.random()-0.5)*8; } else { state.shakeX = 0; state.shakeY = 0; }

  // --- Player Movement ---
  const k = state.keys;
  let dx = 0, dy = 0;
  if (k['ArrowLeft'] || k['KeyA']) dx -= 1;
  if (k['ArrowRight'] || k['KeyD']) dx += 1;
  if (k['ArrowUp'] || k['KeyW']) dy -= 1;
  if (k['ArrowDown'] || k['KeyS']) dy += 1;
  if (dx && dy) { dx *= 0.707; dy *= 0.707; }
  const spd = state.speedBoostTimer > 0 ? AIRPLANE_SPEED * 2 : AIRPLANE_SPEED;
  const p = state.airplane;
  p.x = Math.max(0, Math.min(W - p.w, p.x + dx * spd));
  p.y = Math.max(0, Math.min(GROUND_Y - p.h - 10, p.y + dy * spd));
  p.y += Math.sin(frameCount * 0.04) * 0.3;

  // --- Banana Drop ---
  const bCool = state.rapidFireTimer > 0 ? BANANA_COOLDOWN / 2 : BANANA_COOLDOWN;
  if (k['Space'] && Date.now() - state.lastBananaDrop > bCool && state.bananas.length < MAX_BANANAS) {
    state.bananas.push({ x: p.x + p.w/2 - 8, y: p.y + p.h, w: 16, h: 20 });
    state.lastBananaDrop = Date.now();
    playDropSound();
  }

  // --- Coconut Bomb ---
  const cCool = state.rapidFireTimer > 0 ? COCONUT_COOLDOWN / 2 : COCONUT_COOLDOWN;
  if (k['KeyE'] && state.coconuts > 0 && Date.now() - state.lastCoconutDrop > cCool) {
    state.coconutBombs.push({ x: p.x + p.w, y: p.y + p.h/2, w: 14, h: 14, dist: 0 });
    state.coconuts--;
    state.lastCoconutDrop = Date.now();
    playDropSound();
  }

  // --- Vine Net ---
  if (k['KeyQ'] && state.vineCharges > 0 && Date.now() - state.lastVineUse > VINE_COOLDOWN) {
    state.vineActiveTimer = VINE_DURATION;
    state.vineCharges--;
    state.lastVineUse = Date.now();
    spawnParticles(p.x + p.w/2, p.y + p.h/2, '#2E7D32', 12);
  }

  // --- Build Allies ---
  if (k['Digit1']) { buildAlly('fighter'); k['Digit1'] = false; }
  if (k['Digit2']) { buildAlly('bomber'); k['Digit2'] = false; }
  if (k['Digit3']) { buildAlly('healer'); k['Digit3'] = false; }

  // --- Waves ---
  state.waveTimer += dt;
  if (state.waveTimer >= WAVE_INTERVAL) { state.waveTimer = 0; spawnWave(); }

  // --- Update Bananas ---
  for (let i = state.bananas.length - 1; i >= 0; i--) {
    const b = state.bananas[i];
    b.y += BANANA_DROP_SPEED;
    // Hit enemies
    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j--) {
      if (aabb(b, state.enemies[j])) {
        state.enemies[j].hp--;
        spawnParticles(b.x+8, b.y+10, '#FFD700', 5);
        playHitSound();
        if (state.enemies[j].hp <= 0) {
          const e = state.enemies[j];
          state.score += ENEMY_KILL_BONUS;
          state.gold += e.gold;
          state.stats.goldEarned += e.gold;
          state.stats.enemiesKilled++;
          spawnParticles(e.x+e.w/2, e.y+e.h/2, e.color, 8);
          maybeSpawnPowerup(e.x, e.y);
          state.enemies.splice(j, 1);
        }
        hit = true; break;
      }
    }
    // Hit alligators
    if (!hit) {
      for (const gator of state.alligators) {
        if (aabb(b, gator) && gator.stunTimer <= 0) {
          gator.stunTimer = BANANA_STUN_DURATION;
          state.score += BANANA_HIT_BONUS;
          spawnParticles(b.x+8, b.y+10, '#FFD700', 8);
          playHitSound();
          hit = true; break;
        }
      }
    }
    if (hit || b.y > H) state.bananas.splice(i, 1);
  }

  // --- Update Coconut Bombs ---
  for (let i = state.coconutBombs.length - 1; i >= 0; i--) {
    const c = state.coconutBombs[i];
    c.x += COCONUT_SPEED;
    c.y += 1.5;
    c.dist += Math.hypot(COCONUT_SPEED, 1.5);
    let explode = c.dist >= COCONUT_RANGE || c.y > H;
    // Check hit enemy
    for (const e of state.enemies) {
      if (aabb(c, e)) { explode = true; break; }
    }
    if (explode) {
      // Explosion
      const cx = c.x + c.w/2, cy = c.y + c.h/2;
      spawnParticles(cx, cy, '#FF6D00', 15, 3, 8);
      spawnParticles(cx, cy, '#FF3D00', 8, 2, 5);
      playExplosionSound();
      // Damage all enemies in blast radius
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        const d = Math.hypot(cx - (e.x+e.w/2), cy - (e.y+e.h/2));
        if (d < COCONUT_BLAST) {
          e.hp -= d < COCONUT_BLAST / 2 ? 2 : 1;
          if (e.hp <= 0) {
            state.score += ENEMY_KILL_BONUS; state.gold += e.gold;
            state.stats.goldEarned += e.gold; state.stats.enemiesKilled++;
            spawnParticles(e.x+e.w/2, e.y+e.h/2, e.color, 8);
            maybeSpawnPowerup(e.x, e.y);
            state.enemies.splice(j, 1);
          }
        }
      }
      state.coconutBombs.splice(i, 1);
    }
  }

  // --- Update Enemies ---
  const vineSlowed = state.vineActiveTimer > 0;
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const spdMult = vineSlowed ? 0.3 : 1;
    e.x -= e.speed * spdMult;
    if (e.type === 'mosquito') e.y += Math.sin(e.phase + e.x * 0.03) * 1.2;
    // Shooting
    if (e.shootInterval > 0) {
      e.shootTimer += dt;
      if (e.shootTimer >= e.shootInterval / (vineSlowed ? 2 : 1)) {
        e.shootTimer = 0;
        if (e.x < W && e.x > -e.w) enemyShoot(e);
      }
    }
    // Collision with player
    if (aabb(e, p)) { damagePlayer(); state.enemies.splice(i, 1); continue; }
    if (e.x < -80) state.enemies.splice(i, 1);
  }

  // --- Enemy Bullets ---
  for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
    const b = state.enemyBullets[i];
    b.x += b.vx; b.y += b.vy;
    if (b.x < -20 || b.x > W+20 || b.y < -20 || b.y > H+20) { state.enemyBullets.splice(i, 1); continue; }
    // Hit player
    if (aabb(b, p)) { damagePlayer(); state.enemyBullets.splice(i, 1); continue; }
    // Hit allies
    for (let j = state.allies.length - 1; j >= 0; j--) {
      if (aabb(b, state.allies[j])) {
        state.allies[j].hp--;
        if (state.allies[j].hp <= 0) {
          const al = state.allies[j];
          spawnParticles(al.x+al.w/2, al.y+al.h/2, '#fff', 6);
          state.allies.splice(j, 1);
        }
        state.enemyBullets.splice(i, 1); break;
      }
    }
  }

  // --- Allies ---
  for (const al of state.allies) {
    al.shootTimer += dt;
    const nearest = state.enemies.reduce((best, e) => (!best || dist(al, e) < dist(al, best)) ? e : best, null);

    if (al.type === 'fighter') {
      if (nearest) {
        const a = angleToward(al, nearest);
        const targetDist = dist(al, nearest);
        if (targetDist > 120) { al.x += Math.cos(a) * al.speed; al.y += Math.sin(a) * al.speed; }
        else { al.angle += 0.03; al.x += Math.cos(al.angle) * al.speed; al.y += Math.sin(al.angle) * al.speed; }
        if (al.shootTimer >= al.shootInterval) {
          al.shootTimer = 0;
          const ba = angleToward(al, nearest);
          state.allyBullets.push({ x: al.x+al.w, y: al.y+al.h/2, vx: Math.cos(ba)*4, vy: Math.sin(ba)*4, w: 5, h: 5, damage: al.damage });
        }
      }
    } else if (al.type === 'bomber') {
      if (nearest) {
        const tx = nearest.x, ty = nearest.y - 60;
        al.x += Math.sign(tx - al.x) * al.speed * 0.5;
        al.y += Math.sign(ty - al.y) * al.speed * 0.5;
        if (al.shootTimer >= al.shootInterval) {
          al.shootTimer = 0;
          state.allyBullets.push({ x: al.x+al.w/2, y: al.y+al.h, vx: 0, vy: 3, w: 8, h: 8, damage: al.damage, bomb: true });
        }
      }
    } else if (al.type === 'healer') {
      al.angle += 0.02;
      al.x = p.x + p.w/2 + Math.cos(al.angle) * 80 - al.w/2;
      al.y = p.y + p.h/2 + Math.sin(al.angle) * 60 - al.h/2;
      if (al.shootTimer >= al.shootInterval && state.hp < MAX_HP) {
        al.shootTimer = 0;
        state.hp = Math.min(MAX_HP, state.hp + 1);
        spawnParticles(p.x + p.w/2, p.y + p.h/2, '#66BB6A', 6);
      }
    }
    al.x = Math.max(0, Math.min(W - al.w, al.x));
    al.y = Math.max(0, Math.min(GROUND_Y - al.h - 10, al.y));
  }

  // --- Ally Bullets ---
  for (let i = state.allyBullets.length - 1; i >= 0; i--) {
    const b = state.allyBullets[i];
    b.x += b.vx; b.y += b.vy;
    if (b.x < -20 || b.x > W+20 || b.y < -20 || b.y > H+20) { state.allyBullets.splice(i, 1); continue; }
    for (let j = state.enemies.length - 1; j >= 0; j--) {
      if (aabb(b, state.enemies[j])) {
        const e = state.enemies[j];
        e.hp -= b.damage;
        spawnParticles(b.x, b.y, b.bomb ? '#FF6D00' : '#FFEB3B', b.bomb ? 8 : 4);
        if (b.bomb) {
          // Splash damage
          for (let m = state.enemies.length - 1; m >= 0; m--) {
            if (m !== j && dist(b, state.enemies[m]) < 40) state.enemies[m].hp -= 1;
          }
        }
        if (e.hp <= 0) {
          state.score += ENEMY_KILL_BONUS; state.gold += e.gold;
          state.stats.goldEarned += e.gold; state.stats.enemiesKilled++;
          spawnParticles(e.x+e.w/2, e.y+e.h/2, e.color, 8);
          maybeSpawnPowerup(e.x, e.y);
          state.enemies.splice(j, 1);
        }
        // Clean up dead enemies from splash
        for (let m = state.enemies.length - 1; m >= 0; m--) {
          if (state.enemies[m].hp <= 0) {
            const ed = state.enemies[m];
            state.score += ENEMY_KILL_BONUS; state.gold += ed.gold;
            state.stats.goldEarned += ed.gold; state.stats.enemiesKilled++;
            spawnParticles(ed.x+ed.w/2, ed.y+ed.h/2, ed.color, 8);
            maybeSpawnPowerup(ed.x, ed.y);
            state.enemies.splice(m, 1);
          }
        }
        state.allyBullets.splice(i, 1); break;
      }
    }
  }

  // --- Powerups ---
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const pu = state.powerups[i];
    pu.y += pu.vy; pu.x += pu.vx; pu.life -= dt;
    if (aabb(pu, p)) { collectPowerup(pu); state.powerups.splice(i, 1); continue; }
    if (pu.life <= 0 || pu.y > H || pu.x < -30) state.powerups.splice(i, 1);
  }

  // --- Alligators ---
  // Sort by x so nearby ones can detect each other for stacking
  state.alligators.sort((a, b) => a.x - b.x);

  for (const gator of state.alligators) {
    if (gator.stunTimer > 0) { gator.stunTimer -= dt; }
    else {
      gator.speed = ALLIGATOR_BASE_SPEED + elapsed * ALLIGATOR_ACCEL * 80;
      const dir = Math.sign(p.x + p.w/2 - (gator.x + gator.w/2));
      gator.x = Math.max(0, Math.min(W - gator.w, gator.x + dir * gator.speed));
      gator.jumpTimer -= dt;

      if (gator.jumpTimer <= 0 && Math.abs(p.x - gator.x) < 180 && gator.y >= gator.baseY - 1) {
        // Count nearby grounded alligators to stack on
        let stackCount = 0;
        for (const other of state.alligators) {
          if (other !== gator && other.stunTimer <= 0 && other.y >= other.baseY - 1 && Math.abs(other.x - gator.x) < 60) {
            stackCount++;
          }
        }
        gator.boostLevel = stackCount;
        // Base jump = -7, each stacked gator multiplies by 1.6x (exponential!)
        const jumpPower = -7 * Math.pow(1.6, stackCount);
        gator.jumpVy = Math.max(jumpPower, -25); // cap so it doesn't fly off screen forever
        gator.jumpTimer = 2500 + Math.random() * 1500;

        // Stacking visual: particles burst from the launch point
        if (stackCount > 0) {
          spawnParticles(gator.x + gator.w/2, gator.baseY + gator.h/2, '#FF6D00', 4 + stackCount * 3, 2, 6);
          playTone(300 + stackCount * 100, 0.15, 'square', 0.06);
        }
      }
    }

    // Jump physics
    if (gator.jumpVy !== 0 || gator.y < gator.baseY) {
      gator.y += gator.jumpVy; gator.jumpVy += 0.3;
      if (gator.y >= gator.baseY) { gator.y = gator.baseY; gator.jumpVy = 0; gator.boostLevel = 0; }
    }

    if (aabb(p, gator)) damagePlayer();
  }

  // --- Particles ---
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx; pt.y += pt.vy; pt.life -= 0.025;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }

  // --- Clouds ---
  for (const c of state.clouds) { c.x -= 0.4; if (c.x + c.r * 2 < 0) { c.x = W + c.r; c.y = 30 + Math.random() * 70; } }

  // --- Fireflies ---
  for (const f of state.fireflies) {
    f.phase += 0.02;
    f.x += Math.sin(f.phase) * f.speed;
    f.y += Math.cos(f.phase * 0.7) * f.speed * 0.5;
    if (f.x < 0) f.x = W; if (f.x > W) f.x = 0;
    if (f.y < 0) f.y = GROUND_Y - 50; if (f.y > GROUND_Y - 20) f.y = 0;
  }
}

// ============================================================
// DRAWING
// ============================================================
function drawBackground() {
  // Sky gradient - jungle tones
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  grad.addColorStop(0, '#1a4a2a');
  grad.addColorStop(0.3, '#5a9a7a');
  grad.addColorStop(0.7, '#87CEEB');
  grad.addColorStop(1, '#c8e6c9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Far mountains
  ctx.fillStyle = '#1B5E20';
  const mOff = state.bgOffset % W;
  for (let i = -1; i < 4; i++) {
    const mx = i * 300 - mOff;
    ctx.beginPath();
    ctx.moveTo(mx, GROUND_Y);
    ctx.lineTo(mx + 100, GROUND_Y - 100 - (i%2)*40);
    ctx.lineTo(mx + 200, GROUND_Y - 60 - (i%3)*30);
    ctx.lineTo(mx + 300, GROUND_Y);
    ctx.fill();
  }

  // Mid tree canopy
  ctx.fillStyle = '#2E7D32';
  const tOff = state.midOffset % 200;
  for (let i = -1; i < 7; i++) {
    const tx = i * 200 - tOff;
    ctx.beginPath();
    ctx.arc(tx, GROUND_Y, 50 + (i%3)*15, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tx + 80, GROUND_Y, 40 + (i%2)*20, Math.PI, 0);
    ctx.fill();
  }

  // Clouds
  ctx.fillStyle = 'rgba(200, 230, 200, 0.5)';
  for (const c of state.clouds) {
    ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r * 1.5, c.r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c.x - c.r, c.y + 4, c.r, c.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c.x + c.r, c.y + 4, c.r * 0.8, c.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Ground
  const gGrad = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  gGrad.addColorStop(0, '#388E3C');
  gGrad.addColorStop(0.3, '#2E7D32');
  gGrad.addColorStop(1, '#1B5E20');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // Ground texture lines
  ctx.strokeStyle = 'rgba(27, 94, 32, 0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const gy = GROUND_Y + 10 + i * 20;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }

  // Ground foliage
  ctx.fillStyle = '#43A047';
  const fOff = state.midOffset % 120;
  for (let i = -1; i < 10; i++) {
    const fx = i * 120 - fOff;
    ctx.beginPath();
    ctx.moveTo(fx, GROUND_Y); ctx.lineTo(fx + 8, GROUND_Y - 18); ctx.lineTo(fx + 16, GROUND_Y);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx + 40, GROUND_Y); ctx.lineTo(fx + 50, GROUND_Y - 25); ctx.lineTo(fx + 60, GROUND_Y);
    ctx.fill();
  }

  // Fireflies
  for (const f of state.fireflies) {
    const glow = 0.4 + Math.sin(f.phase * 2) * 0.3;
    ctx.globalAlpha = glow;
    ctx.fillStyle = '#FFEE58';
    ctx.beginPath(); ctx.arc(f.x, f.y, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 238, 88, 0.2)';
    ctx.beginPath(); ctx.arc(f.x, f.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Vine net overlay
  if (state.vineActiveTimer > 0) {
    ctx.fillStyle = `rgba(46, 125, 50, ${0.08 + Math.sin(frameCount * 0.1) * 0.03})`;
    ctx.fillRect(0, 0, W, GROUND_Y);
  }
}

function drawAirplane() {
  const p = state.airplane;
  const cx = p.x + p.w/2, cy = p.y + p.h/2;

  // Invuln flash
  if (state.invulnTimer > 0 && Math.floor(frameCount / 4) % 2 === 0) return;

  ctx.save();
  ctx.translate(cx, cy);

  // Speed lines
  if (state.speedBoostTimer > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const ly = -8 + i * 5;
      ctx.beginPath(); ctx.moveTo(-p.w/2 - 10 - Math.random()*15, ly); ctx.lineTo(-p.w/2 - 2, ly); ctx.stroke();
    }
  }

  // Rapid fire glow
  if (state.rapidFireTimer > 0) {
    ctx.fillStyle = 'rgba(239, 83, 80, 0.15)';
    ctx.beginPath(); ctx.arc(0, 0, 35, 0, Math.PI * 2); ctx.fill();
  }

  // Body - jungle camo
  ctx.fillStyle = '#556B2F';
  ctx.beginPath(); ctx.ellipse(0, 0, p.w/2, p.h/3, 0, 0, Math.PI * 2); ctx.fill();
  // Camo patches
  ctx.fillStyle = '#3E5022';
  ctx.beginPath(); ctx.ellipse(-8, -3, 10, 5, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(8, 4, 8, 4, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4A5D23'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, p.w/2, p.h/3, 0, 0, Math.PI * 2); ctx.stroke();

  // Nose stripe
  ctx.fillStyle = '#D32F2F';
  ctx.beginPath(); ctx.ellipse(p.w/2 - 5, 0, 6, p.h/3 - 2, 0, -Math.PI/2, Math.PI/2); ctx.fill();

  // Cockpit
  ctx.fillStyle = '#81D4FA';
  ctx.beginPath(); ctx.arc(p.w/4, -1, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4FC3F7'; ctx.lineWidth = 0.5; ctx.stroke();

  // Wings
  ctx.fillStyle = '#4E6B2F';
  ctx.beginPath(); ctx.moveTo(-5, -p.h/3); ctx.lineTo(-18, -p.h/3-16); ctx.lineTo(18, -p.h/3-16); ctx.lineTo(5, -p.h/3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#66BB6A';
  ctx.fillRect(12, -p.h/3-16, 6, 16); // Wing tip
  ctx.fillStyle = '#4E6B2F';
  ctx.beginPath(); ctx.moveTo(-5, p.h/3); ctx.lineTo(-18, p.h/3+16); ctx.lineTo(18, p.h/3+16); ctx.lineTo(5, p.h/3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#66BB6A';
  ctx.fillRect(12, p.h/3, 6, 16);

  // Tail
  ctx.fillStyle = '#4E6B2F';
  ctx.beginPath(); ctx.moveTo(-p.w/2, 0); ctx.lineTo(-p.w/2-12, -14); ctx.lineTo(-p.w/2-6, 0); ctx.lineTo(-p.w/2-12, 14); ctx.closePath(); ctx.fill();

  // Propeller
  const pa = frameCount * 0.5;
  ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(p.w/2 + Math.cos(pa)*14, Math.sin(pa)*14); ctx.lineTo(p.w/2 - Math.cos(pa)*14, -Math.sin(pa)*14); ctx.stroke();

  // Shield
  if (state.shield) {
    ctx.strokeStyle = 'rgba(66, 165, 245, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(66, 165, 245, 0.1)';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

function drawAlligator(g) {
  const stunned = g.stunTimer > 0;
  const boosted = g.boostLevel > 0 && g.y < g.baseY;
  ctx.save();
  ctx.translate(g.x, g.y);

  const facingRight = (state.airplane.x + state.airplane.w/2) > (g.x + g.w/2);
  if (!facingRight) { ctx.translate(g.w, 0); ctx.scale(-1, 1); }

  // Boost trail when launched by stack
  if (boosted) {
    ctx.fillStyle = `rgba(255, 109, 0, ${0.2 + g.boostLevel * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(g.w/2 - 10, g.h + 5);
    ctx.lineTo(g.w/2, g.h + 15 + g.boostLevel * 8);
    ctx.lineTo(g.w/2 + 10, g.h + 5);
    ctx.closePath();
    ctx.fill();
  }

  // Body - tinted red/orange when boost-launched
  const bodyColor = boosted ? '#8B4513' : (stunned && Math.floor(frameCount/4)%2===0 ? '#81C784' : '#2E7D32');
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.ellipse(g.w/2, g.h/2, g.w/2, g.h/2, 0, 0, Math.PI*2); ctx.fill();
  // Scales
  ctx.fillStyle = boosted ? 'rgba(139,69,19,0.5)' : 'rgba(27,94,32,0.5)';
  for (let s = 0; s < 5; s++) { ctx.fillRect(10 + s*12, g.h/2-4, 8, 8); }

  // Snout
  ctx.fillStyle = stunned && Math.floor(frameCount/4)%2===0 ? '#66BB6A' : '#1B5E20';
  ctx.beginPath(); ctx.ellipse(g.w+8, g.h/2, 18, 10, 0, 0, Math.PI*2); ctx.fill();
  // Teeth
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(g.w-2+i*6, g.h/2+7); ctx.lineTo(g.w+1+i*6, g.h/2+13); ctx.lineTo(g.w+4+i*6, g.h/2+7); ctx.closePath(); ctx.fill(); }

  // Eye - glowing when boosted
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(g.w/2+14, g.h/2-12, 7, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = boosted ? '#FF6D00' : (stunned ? '#666' : '#D32F2F');
  ctx.beginPath(); ctx.arc(g.w/2+16, g.h/2-12, 3.5, 0, Math.PI*2); ctx.fill();

  // Legs
  ctx.fillStyle = '#1B5E20';
  ctx.fillRect(10, g.h-2, 10, 12); ctx.fillRect(g.w-20, g.h-2, 10, 12);

  // Stun stars
  if (stunned) {
    ctx.fillStyle = '#FFD700'; ctx.font = '18px serif';
    const w = Math.sin(frameCount*0.2)*6;
    ctx.fillText('\u2605', g.w/2-18+w, -8); ctx.fillText('\u2605', g.w/2+12-w, -4); ctx.fillText('\u2605', g.w/2-4, -16+w);
  }

  // Boost level indicator
  if (boosted) {
    ctx.fillStyle = '#FF6D00'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    ctx.fillText('x' + (g.boostLevel + 1), g.w/2, -12);
  }

  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x + e.w/2, e.y + e.h/2);

  // Vine tint
  if (state.vineActiveTimer > 0) ctx.globalAlpha = 0.7;

  if (e.type === 'mosquito') {
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();
    // Wings
    ctx.strokeStyle = 'rgba(150,100,200,0.6)'; ctx.lineWidth = 1.5;
    const wf = Math.sin(frameCount * 0.5) * 8;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -wf); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, -wf); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, wf); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, wf); ctx.stroke();
    // Eyes
    ctx.fillStyle = '#F44336'; ctx.beginPath(); ctx.arc(-3, -3, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -3, 2, 0, Math.PI*2); ctx.fill();
  } else if (e.type === 'toucan') {
    // Body
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.ellipse(0, 0, e.w/2, e.h/2, 0, 0, Math.PI*2); ctx.fill();
    // Chest
    ctx.fillStyle = '#FFFDE7';
    ctx.beginPath(); ctx.arc(2, 4, 7, 0, Math.PI*2); ctx.fill();
    // Beak
    ctx.fillStyle = '#FFC107';
    ctx.beginPath(); ctx.moveTo(-e.w/2, -2); ctx.lineTo(-e.w/2-18, 2); ctx.lineTo(-e.w/2, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FF8F00';
    ctx.beginPath(); ctx.moveTo(-e.w/2, 2); ctx.lineTo(-e.w/2-18, 2); ctx.lineTo(-e.w/2, 6); ctx.closePath(); ctx.fill();
    // Wing
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.ellipse(5, -3, 12, 8, 0.3, 0, Math.PI*2); ctx.fill();
    // Eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-6, -4, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-5, -4, 2, 0, Math.PI*2); ctx.fill();
  } else if (e.type === 'enemyPlane') {
    // Body
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.ellipse(0, 0, e.w/2, e.h/3, 0, 0, Math.PI*2); ctx.fill();
    // Wings
    ctx.fillStyle = '#880E4F';
    ctx.beginPath(); ctx.moveTo(-5,-e.h/3); ctx.lineTo(-14,-e.h/3-12); ctx.lineTo(14,-e.h/3-12); ctx.lineTo(5,-e.h/3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5,e.h/3); ctx.lineTo(-14,e.h/3+12); ctx.lineTo(14,e.h/3+12); ctx.lineTo(5,e.h/3); ctx.closePath(); ctx.fill();
    // Skull
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-2, -1, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(2, -1, 1.5, 0, Math.PI*2); ctx.fill();
    // Propeller
    const rpa = frameCount * 0.4;
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-e.w/2+Math.cos(rpa)*10, Math.sin(rpa)*10); ctx.lineTo(-e.w/2-Math.cos(rpa)*10, -Math.sin(rpa)*10); ctx.stroke();
  } else if (e.type === 'crocCopter') {
    // Body
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.ellipse(0, 4, e.w/2, e.h/2-6, 0, 0, Math.PI*2); ctx.fill();
    // Snout
    ctx.fillStyle = '#2E7D32';
    ctx.beginPath(); ctx.ellipse(-e.w/2-10, 6, 14, 9, 0, 0, Math.PI*2); ctx.fill();
    // Teeth
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) { ctx.fillRect(-e.w/2-14+i*5, 12, 3, 5); }
    // Eye
    ctx.fillStyle = '#F44336'; ctx.beginPath(); ctx.arc(-8, -6, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-7, -6, 2.5, 0, Math.PI*2); ctx.fill();
    // Rotor
    const ra = frameCount * 0.6;
    ctx.strokeStyle = '#555'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(Math.cos(ra)*28, -e.h/2+Math.sin(ra)*4); ctx.lineTo(-Math.cos(ra)*28, -e.h/2-Math.sin(ra)*4); ctx.stroke();
    // Rotor pole
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -e.h/2+6); ctx.lineTo(0, -e.h/2); ctx.stroke();
  }

  // HP bar
  if (e.hp < e.maxHp) {
    const bw = e.w;
    ctx.fillStyle = '#333'; ctx.fillRect(-bw/2, -e.h/2-8, bw, 4);
    ctx.fillStyle = '#F44336'; ctx.fillRect(-bw/2, -e.h/2-8, bw * (e.hp/e.maxHp), 4);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawAlly(al) {
  ctx.save();
  ctx.translate(al.x + al.w/2, al.y + al.h/2);

  if (al.type === 'fighter') {
    ctx.fillStyle = '#689F38';
    ctx.beginPath(); ctx.ellipse(0, 0, al.w/2, al.h/3, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#FFEB3B'; ctx.fillRect(-al.w/4, -1, al.w/2, 2);
    ctx.fillStyle = '#558B2F';
    ctx.beginPath(); ctx.moveTo(-3,-al.h/3); ctx.lineTo(-10,-al.h/3-8); ctx.lineTo(10,-al.h/3-8); ctx.lineTo(3,-al.h/3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-3,al.h/3); ctx.lineTo(-10,al.h/3+8); ctx.lineTo(10,al.h/3+8); ctx.lineTo(3,al.h/3); ctx.closePath(); ctx.fill();
  } else if (al.type === 'bomber') {
    ctx.fillStyle = '#33691E';
    ctx.beginPath(); ctx.ellipse(0, 0, al.w/2, al.h/3, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1B5E20';
    ctx.beginPath(); ctx.moveTo(-4,-al.h/3); ctx.lineTo(-14,-al.h/3-10); ctx.lineTo(14,-al.h/3-10); ctx.lineTo(4,-al.h/3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4,al.h/3); ctx.lineTo(-14,al.h/3+10); ctx.lineTo(14,al.h/3+10); ctx.lineTo(4,al.h/3); ctx.closePath(); ctx.fill();
    // Bomb bay
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, al.h/3+2, 4, 0, Math.PI*2); ctx.fill();
  } else if (al.type === 'healer') {
    ctx.fillStyle = '#E0E0E0';
    ctx.beginPath(); ctx.ellipse(0, 0, al.w/2, al.h/3, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#BDBDBD';
    ctx.beginPath(); ctx.moveTo(-3,-al.h/3); ctx.lineTo(-10,-al.h/3-8); ctx.lineTo(10,-al.h/3-8); ctx.lineTo(3,-al.h/3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-3,al.h/3); ctx.lineTo(-10,al.h/3+8); ctx.lineTo(10,al.h/3+8); ctx.lineTo(3,al.h/3); ctx.closePath(); ctx.fill();
    // Red cross
    ctx.fillStyle = '#D32F2F';
    ctx.fillRect(-2, -5, 4, 10); ctx.fillRect(-5, -2, 10, 4);
  }
  ctx.restore();
}

function drawBanana(b) {
  ctx.save(); ctx.translate(b.x + b.w/2, b.y + b.h/2);
  ctx.fillStyle = '#FFD700';
  ctx.beginPath(); ctx.arc(0, 0, 8, Math.PI*0.2, Math.PI*0.8); ctx.arc(0, -3, 8, Math.PI*0.8, Math.PI*0.2, true); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(5, -6); ctx.lineTo(7, -10); ctx.stroke();
  ctx.restore();
}

function drawCoconut(c) {
  ctx.save(); ctx.translate(c.x + c.w/2, c.y + c.h/2);
  ctx.fillStyle = '#5D4037';
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(4, 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-3, 3); ctx.lineTo(3, -3); ctx.stroke();
  // Fuse
  ctx.strokeStyle = '#FF6F00'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(6, -8); ctx.stroke();
  ctx.fillStyle = '#FFAB00';
  ctx.beginPath(); ctx.arc(6, -8, 2 + Math.sin(frameCount*0.3), 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawPowerup(pu) {
  ctx.save(); ctx.translate(pu.x + pu.w/2, pu.y + pu.h/2);
  const bob = Math.sin(frameCount * 0.06 + pu.x) * 3;
  ctx.translate(0, bob);

  // Glow
  ctx.fillStyle = pu.color + '33';
  ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
  // Circle
  ctx.fillStyle = pu.color;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI*2); ctx.stroke();

  // Icons
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  if (pu.type === 'shield') {
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-5, -3); ctx.lineTo(-5, 3); ctx.lineTo(0, 7); ctx.lineTo(5, 3); ctx.lineTo(5, -3); ctx.closePath(); ctx.stroke();
  } else if (pu.type === 'speedBoost') {
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(5, 0); ctx.moveTo(2, -4); ctx.lineTo(6, 0); ctx.lineTo(2, 4); ctx.stroke();
  } else if (pu.type === 'rapidFire') {
    ctx.fillRect(-1, -5, 3, 10);
    ctx.beginPath(); ctx.arc(0.5, -5, 2, 0, Math.PI*2); ctx.fill();
  } else if (pu.type === 'health') {
    ctx.fillRect(-1, -5, 3, 10); ctx.fillRect(-5, -1, 10, 3);
  } else if (pu.type === 'coconutAmmo') {
    ctx.fillStyle = '#3E2723'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill();
  } else if (pu.type === 'vineCharge') {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*1.5); ctx.stroke();
  } else if (pu.type === 'goldCrate') {
    ctx.fillStyle = '#FFF8E1'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 5);
  }
  ctx.restore();
}

function drawBullet(b, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(b.x + b.w/2, b.y + b.h/2, 3, 0, Math.PI*2); ctx.fill();
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  const elapsed = state.gameTime / 1000;
  const remaining = Math.max(0, Math.ceil(GAME_DURATION - elapsed));

  ctx.save();

  // HP hearts
  ctx.font = '16px serif';
  for (let i = 0; i < MAX_HP; i++) {
    ctx.fillStyle = i < state.hp ? '#F44336' : '#555';
    ctx.fillText('\u2764', 12 + i * 22, 24);
  }

  // Gold
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 16px monospace';
  ctx.beginPath(); ctx.arc(140, 19, 8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#FFA000'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('$', 140, 23);
  ctx.fillStyle = '#FFD700'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'left';
  ctx.fillText(Math.floor(state.gold), 155, 25);

  // Wave
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 3;
  ctx.fillText(`Wave ${state.waveNumber}`, W/2, 24);

  // Weapons
  ctx.textAlign = 'right'; ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#FFD700'; ctx.fillText('\uD83C\uDF4C \u221E', W - 180, 24);
  ctx.fillStyle = '#8D6E63'; ctx.fillText('\uD83E\uDD65 ' + state.coconuts, W - 115, 24);
  ctx.fillStyle = '#66BB6A'; ctx.fillText('\uD83C\uDF3F ' + state.vineCharges, W - 60, 24);

  // Timer
  ctx.fillStyle = remaining <= 20 ? '#FF5252' : '#fff';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(remaining + 's', W - 10, 24);

  // Ally indicators
  ctx.textAlign = 'left'; ctx.font = '12px monospace';
  const allyColors = { fighter: '#689F38', bomber: '#33691E', healer: '#E0E0E0' };
  state.allies.forEach((al, i) => {
    ctx.fillStyle = allyColors[al.type] || '#fff';
    ctx.beginPath(); ctx.arc(14 + i * 20, 46, 6, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    ctx.fillText(al.type[0].toUpperCase(), 14 + i * 20, 49);
  });

  // Active powerup timers
  let py = 60;
  ctx.textAlign = 'left'; ctx.font = '11px monospace';
  if (state.speedBoostTimer > 0) {
    ctx.fillStyle = '#FFEE58'; ctx.fillRect(10, py, 60 * (state.speedBoostTimer / 6000), 6);
    ctx.strokeStyle = '#FFC107'; ctx.strokeRect(10, py, 60, 6);
    ctx.fillStyle = '#fff'; ctx.fillText('SPD', 75, py + 6);
    py += 12;
  }
  if (state.rapidFireTimer > 0) {
    ctx.fillStyle = '#EF5350'; ctx.fillRect(10, py, 60 * (state.rapidFireTimer / 6000), 6);
    ctx.strokeStyle = '#D32F2F'; ctx.strokeRect(10, py, 60, 6);
    ctx.fillStyle = '#fff'; ctx.fillText('RPD', 75, py + 6);
    py += 12;
  }
  if (state.vineActiveTimer > 0) {
    ctx.fillStyle = '#66BB6A'; ctx.fillRect(10, py, 60 * (state.vineActiveTimer / VINE_DURATION), 6);
    ctx.strokeStyle = '#388E3C'; ctx.strokeRect(10, py, 60, 6);
    ctx.fillStyle = '#fff'; ctx.fillText('NET', 75, py + 6);
  }
  if (state.shield) {
    ctx.fillStyle = '#42A5F5'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillText('\uD83D\uDEE1\uFE0F SHIELD', 10, py + 18);
  }

  // Alligator count warning
  if (state.alligators.length > 1) {
    ctx.fillStyle = '#FF6D00'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('\uD83D\uDC0A x' + state.alligators.length, W/2, 44);
  }

  // Build costs hint (bottom)
  ctx.globalAlpha = 0.5; ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#ccc';
  ctx.fillText('[1] Fighter 100g  [2] Bomber 200g  [3] Healer 150g', W/2, H - 8);
  ctx.globalAlpha = 1;

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ============================================================
// RENDER
// ============================================================
function render() {
  ctx.save();
  ctx.translate(state.shakeX, state.shakeY);

  drawBackground();

  // Bananas
  for (const b of state.bananas) drawBanana(b);
  // Coconut bombs
  for (const c of state.coconutBombs) drawCoconut(c);
  // Powerups
  for (const pu of state.powerups) drawPowerup(pu);
  // Alligators
  for (const gator of state.alligators) drawAlligator(gator);
  // Enemies
  for (const e of state.enemies) drawEnemy(e);
  // Enemy bullets
  for (const b of state.enemyBullets) drawBullet(b, '#FF5252');
  // Ally bullets
  for (const b of state.allyBullets) drawBullet(b, '#FFEB3B');
  // Allies
  for (const al of state.allies) drawAlly(al);
  // Player
  drawAirplane();
  // Particles
  drawParticles();
  // HUD
  drawHUD();

  ctx.restore();
}

// ============================================================
// GAME LOOP
// ============================================================
function gameLoop(timestamp) {
  const dt = Math.min(timestamp - lastTimestamp, 50);
  lastTimestamp = timestamp;
  frameCount++;
  update(dt);
  render();
  if (!state.gameOver) requestAnimationFrame(gameLoop);
  else if (state.shakeTimer > 0) requestAnimationFrame(gameLoop);
}

function showEndScreen() {
  const overlay = document.getElementById('gameOverOverlay');
  const title = document.getElementById('endTitle');
  const msg = document.getElementById('endMessage');
  const stats = document.getElementById('endStats');
  const score = document.getElementById('finalScore');
  const s = state.stats;

  title.textContent = state.won ? 'Mission Complete!' : 'Mission Failed!';
  msg.textContent = state.won ? 'You escaped the jungle!' : 'The jungle claimed another pilot...';
  stats.innerHTML = `Wave Reached: ${s.waveReached}<br>Enemies Defeated: ${s.enemiesKilled}<br>Alligators Faced: ${state.alligators.length}<br>Allies Built: ${s.alliesBuilt}<br>Gold Earned: ${s.goldEarned}<br>Powerups Collected: ${s.powerupsCollected}`;
  score.textContent = `Score: ${Math.floor(state.score)}`;

  setTimeout(() => overlay.classList.remove('hidden'), state.won ? 0 : 450);
}

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
  spawnWave();
  requestAnimationFrame(gameLoop);
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

init();
render();
