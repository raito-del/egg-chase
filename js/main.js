// Egg Chase — সব গেম লজিক এই একটা ফাইলে
(function () {
  'use strict';

  const CONFIG = window.EGG_CHASE_CONFIG || {};
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  const els = {
    menu: $('menu'), hud: $('hud'), pauseScreen: $('pauseScreen'), over: $('over'),
    name: $('name'), start: $('start'), pause: $('pause'),
    resume: $('resume'), restartPause: $('restartPause'), restart: $('restart'),
    dist: $('dist'), best: $('best'),
    overMsg: $('overMsg'), overScore: $('overScore'), overBest: $('overBest'),
  };

  const LANE_COUNT = 3;
  const BEST_KEY = 'eggchase_best';
  const NAME_KEY = 'eggchase_name';
  const DEFAULT_NAME = String(CONFIG.playerName || '').trim().slice(0, 12) || 'Runner';
  const CHASER_NAME = String(CONFIG.chaserName || '').trim().slice(0, 12) || 'Chaser';
  const FORCE_NAME = !!CONFIG.forceName;

  let W = 0, H = 0, DPR = 1, S = 1; // S = আকারের স্কেল

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function loadBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ }
  }
  function loadName() {
    if (FORCE_NAME) return DEFAULT_NAME;
    try { return localStorage.getItem(NAME_KEY) || DEFAULT_NAME; } catch (e) { return DEFAULT_NAME; }
  }
  function saveName(n) {
    if (FORCE_NAME) return;
    try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ignore */ }
  }

  const game = {
    state: 'menu',      // menu | playing | paused | over
    name: DEFAULT_NAME, // খেলোয়াড়ের নাম
    lane: 1,            // টার্গেট লেন 0..2
    laneVis: 1,         // আঁকার জন্য মসৃণ লেন
    dist: 0,            // মিটার
    speed: 170,         // পিক্সেল/সেকেন্ড
    time: 0,
    spawnT: 1,
    phase: 0,           // দৌড়ানোর অ্যানিমেশন
    throwT: 0,          // তাড়াকারীর ছোড়ার অ্যানিমেশন
    eggs: [],
    parts: [],
    best: loadBest(),
    bgOff: 0,
    clouds: [],
    dustT: 0,
  };

  /* ---------- লেআউট ---------- */

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    S = clamp(Math.min(H / 700, W / 520), 0.55, 1.4);
    if (game.clouds.length === 0) initClouds();
  }

  function initClouds() {
    game.clouds = [];
    for (let i = 0; i < 7; i++) {
      game.clouds.push({
        x: rand(0, W),
        y: rand(H * 0.05, H * 0.3),
        s: rand(0.7, 1.4),
        v: rand(0.5, 0.9),
      });
    }
  }

  // পায়ের y অবস্থান, t = 0..2 (উপরের লেন থেকে নিচের লেন)
  function laneFeet(t) {
    const a = H * 0.70, b = H * 0.80, c = H * 0.90;
    return t <= 1 ? a + (b - a) * t : b + (c - b) * (t - 1);
  }
  function playerX() { return W * 0.28; }
  function chaserX() { return W * 0.08; }

  /* ---------- গেম লজিক ---------- */

  function spawnEgg() {
    const lane = Math.floor(rand(0, LANE_COUNT));
    game.eggs.push({
      lane,
      x: chaserX() + 30 * S,
      vx: game.speed * 1.9 + 160,
      rot: rand(0, Math.PI * 2),
      spin: rand(4, 8) * (Math.random() < 0.5 ? -1 : 1),
      hit: false,
    });
    game.throwT = 1;
  }

  function burst(x, y) {
    const colors = ['#ffffff', '#ffe08a', '#ffb3c6'];
    for (let i = 0; i < 22; i++) {
      game.parts.push({
        x, y,
        vx: rand(-220, 220),
        vy: rand(-420, -120),
        r: rand(3, 6),
        life: rand(0.45, 0.85),
        maxLife: 0.85,
        color: colors[i % colors.length],
        gravity: 900,
      });
    }
  }

  function dust() {
    const feet = laneFeet(game.laneVis);
    game.parts.push({
      x: playerX() - 14 * S,
      y: feet - 2 * S,
      vx: rand(-90, -40),
      vy: rand(-50, -20),
      r: rand(4, 7),
      life: 0.5,
      maxLife: 0.5,
      color: 'rgba(255, 255, 255, 0.55)',
      gravity: 60,
    });
  }

  function update(dt) {
    game.time += dt;
    game.speed = 170 + Math.min(game.time * 5, 240);
    game.dist += (game.speed * dt) / 20;
    game.phase += dt * 10 * (game.speed / 170);
    game.laneVis += (game.lane - game.laneVis) * (1 - Math.exp(-dt * 14));

    // দৌড়ানোর সময় ধুলো
    game.dustT -= dt;
    if (game.dustT <= 0) {
      dust();
      game.dustT = 0.09;
    }

    game.spawnT -= dt;
    if (game.spawnT <= 0) {
      spawnEgg();
      game.spawnT = Math.max(0.5, 1.4 - game.time * 0.01) * rand(0.7, 1.3);
    }
    game.throwT = Math.max(0, game.throwT - dt * 2.5);

    const px = playerX();
    for (const e of game.eggs) {
      e.x += e.vx * dt;
      e.rot += e.spin * dt;
      if (!e.hit && e.lane === game.lane && Math.abs(e.x - px) < 26 * S) {
        e.hit = true;
        burst(e.x, laneFeet(e.lane) - 30 * S);
        endGame();
        return;
      }
    }
    game.eggs = game.eggs.filter((e) => e.x < W + 60 && !e.hit);

    for (const p of game.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
    }
    game.parts = game.parts.filter((p) => p.life > 0);
  }

  function updateBg(dt, speed) {
    game.bgOff += speed * dt;
    for (const c of game.clouds) {
      c.x -= speed * dt * 0.12 * c.v;
      if (c.x < -160 * S) {
        c.x = W + rand(40, 200);
        c.y = rand(H * 0.05, H * 0.3);
      }
    }
  }

  function move(dir) {
    if (game.state !== 'playing') return;
    game.lane = clamp(game.lane + dir, 0, LANE_COUNT - 1);
  }

  function show(el, on) { el.classList.toggle('hidden', !on); }

  function startGame() {
    if (FORCE_NAME) {
      game.name = DEFAULT_NAME;
    } else {
      const n = (els.name.value || '').trim().slice(0, 12);
      game.name = n || DEFAULT_NAME;
      saveName(game.name);
    }
    els.name.value = game.name;
    Object.assign(game, {
      state: 'playing', lane: 1, laneVis: 1, dist: 0, speed: 170, time: 0,
      spawnT: 1, phase: 0, throwT: 0, eggs: [], parts: [], dustT: 0,
    });
    show(els.menu, false);
    show(els.over, false);
    show(els.pauseScreen, false);
    show(els.hud, true);
  }

  function endGame() {
    game.state = 'over';
    const score = Math.floor(game.dist);
    if (score > game.best) {
      game.best = score;
      saveBest(score);
    }
    els.overMsg.textContent = game.name + ', তুমি ' + score + ' মিটার দৌড়াতে পেরেছো! ' + CHASER_NAME + ' তোমাকে ধরতে পারেনি।';
    els.overScore.textContent = score;
    els.overBest.textContent = game.best;
    show(els.hud, false);
    show(els.over, true);
  }

  function togglePause() {
    if (game.state === 'playing') {
      game.state = 'paused';
      show(els.pauseScreen, true);
    } else if (game.state === 'paused') {
      game.state = 'playing';
      show(els.pauseScreen, false);
    }
  }

  /* ---------- আঁকার ফাংশন ---------- */

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // মাথার উপরে নামের ট্যাগ। x = কেন্দ্র, y = ট্যাগের মাঝখান
  function drawNameTag(x, y, text, color) {
    ctx.save();
    ctx.font = 'bold ' + Math.round(13 * S) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const pad = 8 * S, h = 20 * S;
    // স্ক্রিনের বাইরে না যায়
    const cx = clamp(x, tw / 2 + pad + 4, W - tw / 2 - pad - 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    roundRect(cx - tw / 2 - pad, y - h / 2, tw + pad * 2, h, 8 * S);
    ctx.fill();
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(text, cx, y);
    ctx.restore();
  }

  function drawCloud(x, y, s) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    const parts = [[0, 0, 30], [30, -12, 38], [66, 0, 30], [-28, 6, 24]];
    for (const [dx, dy, r] of parts) {
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d2350');
    g.addColorStop(0.55, '#5a6fb8');
    g.addColorStop(1, '#a6d8f0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // সূর্য, হালকা পালস সহ
    const pulse = 1 + Math.sin(game.time * 1.5) * 0.03;
    const sx = W * 0.82, sy = H * 0.18, sr = 46 * S * pulse;
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 2.6);
    glow.addColorStop(0, 'rgba(255, 230, 140, 0.55)');
    glow.addColorStop(1, 'rgba(255, 230, 140, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds() {
    for (const c of game.clouds) drawCloud(c.x, c.y, c.s * S * 1.2);
  }

  function hillLayer(color, base, amp, freq, off) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) {
      const y = base
        + Math.sin((x + off) * freq) * amp
        + Math.sin((x + off) * freq * 2.7 + 1.3) * amp * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawHills() {
    hillLayer('#4a5f5a', H * 0.52, H * 0.05, 0.006, game.bgOff * 0.15);
    hillLayer('#6b9a6a', H * 0.60, H * 0.04, 0.009, game.bgOff * 0.35);
  }

  function drawGround() {
    const top = H * 0.60;
    ctx.fillStyle = '#6fae5a';
    ctx.fillRect(0, top, W, H * 0.07);
    ctx.fillStyle = '#c9a050';
    ctx.fillRect(0, top + H * 0.07, W, H);

    // লেনের দাগ, বাম দিকে সরে যায়
    ctx.strokeStyle = 'rgba(90, 60, 20, 0.45)';
    ctx.lineWidth = 3 * S;
    ctx.setLineDash([24 * S, 18 * S]);
    ctx.lineDashOffset = game.bgOff;
    for (const t of [0.5, 1.5]) {
      const y = laneFeet(t);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawChaser() {
    const x = chaserX();
    const feet = laneFeet(1);
    ctx.save();
    ctx.translate(x, feet);
    ctx.scale(S, S);
    ctx.lineCap = 'round';

    ctx.strokeStyle = '#3a2a22';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-4, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(4, 0); ctx.stroke();

    ctx.strokeStyle = '#8a5a44';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -52); ctx.stroke();

    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(-8, -38); ctx.stroke();
    // ছোড়ার হাত
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.lineTo(-6 + game.throwT * 26, -46 - game.throwT * 4);
    ctx.stroke();

    ctx.fillStyle = '#e8b98f';
    ctx.beginPath(); ctx.arc(0, -64, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2b1a12';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-5, -70); ctx.lineTo(-1, -68); ctx.stroke();
    ctx.fillStyle = '#2b1a12';
    ctx.beginPath(); ctx.arc(3, -63, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // তাড়াকারীর নামের ট্যাগ
    drawNameTag(x, feet - 92 * S, CHASER_NAME, '#ffb3c6');
  }

  function drawEggs() {
    for (const e of game.eggs) {
      const feet = laneFeet(e.lane);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.beginPath();
      ctx.ellipse(e.x, feet + 2 * S, 10 * S, 3 * S, 0, 0, Math.PI * 2);
      ctx.fill();

      const y = feet - 30 * S;
      ctx.save();
      ctx.translate(e.x, y);
      ctx.rotate(e.rot);
      const g = ctx.createRadialGradient(-4 * S, -5 * S, 2 * S, 0, 0, 18 * S);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#f0e2c0');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12 * S, 16 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawRunner() {
    const x = playerX();
    const feet = laneFeet(game.laneVis);
    const sw = Math.sin(game.phase);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x, feet + 2 * S, 22 * S, 6 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, feet);
    ctx.scale(S, S);
    ctx.lineCap = 'round';

    // পা
    ctx.strokeStyle = '#2b3158';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(sw * 12, -Math.max(0, sw) * 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(-sw * 12, -Math.max(0, -sw) * 6);
    ctx.stroke();

    // শরীর
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -52); ctx.stroke();

    // হাত
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(-sw * 14, -36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(sw * 14, -36); ctx.stroke();

    // মাথা ও টুপি
    ctx.fillStyle = '#ffe0bd';
    ctx.beginPath(); ctx.arc(0, -64, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5d8f';
    ctx.beginPath(); ctx.arc(0, -66, 11, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-12, -66, 22, 3);
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(4, -62, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // খেলোয়াড়ের নামের ট্যাগ
    drawNameTag(x, feet - 92 * S, game.name, '#ffffff');
  }

  function drawParticles() {
    for (const p of game.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * S, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawSky();
    drawClouds();
    drawHills();
    drawGround();
    drawChaser();
    drawEggs();
    drawRunner();
    drawParticles();
    els.dist.textContent = Math.floor(game.dist);
    els.best.textContent = game.best;
  }

  /* ---------- লুপ ও ইনপুট ---------- */

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    if (game.state === 'playing') update(dt);
    const bgSpeed = game.state === 'playing' ? game.speed
      : game.state === 'paused' ? 0 : 110;
    updateBg(dt, bgSpeed);

    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'Enter') {
      if (game.state === 'menu' || game.state === 'over') {
        e.preventDefault();
        startGame();
      }
      return;
    }
    if (k === 'p' || k === 'P') {
      if (document.activeElement === els.name) return; // নাম লেখার সময় P কে পজ না করা
      togglePause();
      return;
    }
    if (game.state !== 'playing') return;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); move(-1); }
    else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); move(1); }
  });

  // মোবাইল: উপরের অর্ধেক ট্যাপ = উপরের লেন, নিচের অর্ধেক = নিচের লেন
  window.addEventListener('pointerdown', (e) => {
    if (game.state !== 'playing') return;
    if (e.target.closest && e.target.closest('button, input')) return;
    move(e.clientY < H / 2 ? -1 : 1);
  });

  // iOS এ স্ক্রল/জুম আটকানো
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  els.start.addEventListener('click', startGame);
  els.restart.addEventListener('click', startGame);
  els.restartPause.addEventListener('click', startGame);
  els.resume.addEventListener('click', togglePause);
  els.pause.addEventListener('click', togglePause);
  window.addEventListener('resize', resize);

  // নাম সেটআপ
  els.name.value = loadName();
  if (FORCE_NAME) {
    els.name.value = DEFAULT_NAME;
    els.name.disabled = true;
    els.name.placeholder = DEFAULT_NAME;
  }
  game.name = els.name.value || DEFAULT_NAME;

  resize();
  show(els.menu, true);
  show(els.hud, false);
  requestAnimationFrame(loop);
})();