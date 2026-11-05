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
    dist: $('dist'), coins: $('coins'), shields: $('shields'), best: $('best'),
    overMsg: $('overMsg'), overScore: $('overScore'), overBest: $('overBest'),
  };

  const LANE_COUNT = 3;
  const BEST_KEY = 'eggchase_best';
  const NAME_KEY = 'eggchase_name';
  const DEFAULT_NAME = String(CONFIG.playerName || '').trim().slice(0, 12) || 'Runner';
  const CHASER_NAME = String(CONFIG.chaserName || '').trim().slice(0, 12) || 'Chaser';
  const FORCE_NAME = !!CONFIG.forceName;

  // দিন ও সন্ধ্যার আকাশের রঙ (উপর, মাঝ, নিচ)
  const DAY = ['#1d2350', '#5a6fb8', '#a6d8f0'];
  const DUSK = ['#2a1b3d', '#c25b7a', '#ffb07a'];

  let W = 0, H = 0, DPR = 1, S = 1; // S = আকারের স্কেল

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t)).join(',') + ')';
  }

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
    state: 'menu',       // menu | playing | paused | over
    name: DEFAULT_NAME,  // খেলোয়াড়ের নাম
    px: 0, py: 0,        // রানারের বর্তমান অবস্থান (পায়ের নিচের বিন্দু)
    tx: 0, ty: 0,        // রানার যেখানে যেতে চায়
    chaserY: 0,          // তাড়াকারীর উচ্চতা, রানারকে অনুসরণ করে
    hold: { up: false, down: false, left: false, right: false },
    ready: false,
    dist: 0,             // স্কোর (মিটার + বোনাস)
    coins: 0,            // এই খেলায় সংগ্রহ করা কয়েন
    shield: 0,           // কতটা ঢাল আছে (সর্বোচ্চ ২)
    speed: 170,          // পিক্সেল/সেকেন্ড
    time: 0,
    spawnT: 1,
    itemT: 1.5,
    phase: 0,            // দৌড়ানোর অ্যানিমেশন
    throwT: 0,           // তাড়াকারীর ছোড়ার অ্যানিমেশন
    eggs: [],
    items: [],           // কয়েন ও ঢাল
    parts: [],
    texts: [],           // ভাসমান লেখা
    shake: 0,            // স্ক্রিন কাঁপার মাত্রা
    best: loadBest(),
    bgOff: 0,
    clouds: [],
    dustT: 0,
  };

  /* ---------- লেআউট ও সীমা ---------- */

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
    if (!game.ready) {
      resetRunner();
      game.ready = true;
    } else {
      setTarget(game.tx, game.ty);
    }
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

  // লেনের পায়ের y অবস্থান (ডিম ও কয়েন এই লেনে চলে), t = 0..2
  function laneFeet(t) {
    const a = H * 0.70, b = H * 0.80, c = H * 0.90;
    return t <= 1 ? a + (b - a) * t : b + (c - b) * (t - 1);
  }

  function chaserX() { return W * 0.08; }

  // রানার কোথায় যেতে পারবে
  function xMin() { return chaserX() + 60 * S; }  // তাড়াকারীর পেছনে যেতে পারবে না
  function xMax() { return W * 0.75; }            // সামনের দিকে সীমা
  function yMin() { return H * 0.62; }
  function yMax() { return H * 0.93; }

  function setTarget(cx, cy) {
    game.tx = clamp(cx, xMin(), xMax());
    game.ty = clamp(cy, yMin(), yMax());
  }

  function resetRunner() {
    game.px = W * 0.28;
    game.py = H * 0.78;
    game.tx = game.px;
    game.ty = game.py;
    game.chaserY = game.py;
    game.hold = { up: false, down: false, left: false, right: false };
  }

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
      near: false,
    });
    game.throwT = 1;
  }

  function spawnItem() {
    const lane = Math.floor(rand(0, LANE_COUNT));
    game.items.push({
      type: Math.random() < 0.22 ? 'shield' : 'coin',
      lane,
      x: W + 40 * S,
      spin: rand(0, Math.PI * 2),
      hit: false,
    });
  }

  function burst(x, y, colors) {
    const cols = colors || ['#ffffff', '#ffe08a', '#ffb3c6'];
    for (let i = 0; i < 22; i++) {
      game.parts.push({
        x, y,
        vx: rand(-220, 220),
        vy: rand(-420, -120),
        r: rand(3, 6),
        life: rand(0.45, 0.85),
        maxLife: 0.85,
        color: cols[i % cols.length],
        gravity: 900,
      });
    }
  }

  function addText(x, y, text, color) {
    game.texts.push({ x, y, text, color, life: 1 });
  }

  function dust() {
    game.parts.push({
      x: game.px - 14 * S,
      y: game.py - 2 * S,
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

    // তীর/বাটন ধরে থাকলে রানার সেই দিকে যাবে
    const step = 380 * dt;
    if (game.hold.left) game.tx -= step;
    if (game.hold.right) game.tx += step;
    if (game.hold.up) game.ty -= step;
    if (game.hold.down) game.ty += step;
    setTarget(game.tx, game.ty);

    // রানার গন্তব্যের দিকে মসৃণভাবে যায়
    const k = 1 - Math.exp(-dt * 12);
    game.px += (game.tx - game.px) * k;
    game.py += (game.ty - game.py) * k;

    // তাড়াকারী রানারের উপর-নিচে অনুসরণ করে
    game.chaserY += (game.py - game.chaserY) * (1 - Math.exp(-dt * 5));

    // দৌড়ানোর সময় ধুলো
    game.dustT -= dt;
    if (game.dustT <= 0) {
      dust();
      game.dustT = 0.09;
    }

    // ডিম ছোড়া
    game.spawnT -= dt;
    if (game.spawnT <= 0) {
      spawnEgg();
      game.spawnT = Math.max(0.5, 1.4 - game.time * 0.01) * rand(0.7, 1.3);
    }
    game.throwT = Math.max(0, game.throwT - dt * 2.5);

    // কয়েন ও ঢাল
    game.itemT -= dt;
    if (game.itemT <= 0) {
      spawnItem();
      game.itemT = rand(1.4, 2.4);
    }

    const px = game.px, py = game.py;
    for (const it of game.items) {
      it.x -= (game.speed * 0.9 + 120) * dt;
      it.spin += dt * 5;
      const feet = laneFeet(it.lane);
      if (!it.hit && Math.abs(it.x - px) < 26 * S && Math.abs(feet - py) < 26 * S) {
        it.hit = true;
        if (it.type === 'coin') {
          game.coins += 1;
          game.dist += 5;
          addText(it.x, feet - 60 * S, '+5', '#ffd23f');
          burst(it.x, feet - 30 * S, ['#ffe066', '#ffd23f', '#fff4b0']);
        } else {
          game.shield = Math.min(2, game.shield + 1);
          addText(it.x, feet - 60 * S, 'Shield!', '#7fd8ff');
          burst(it.x, feet - 30 * S, ['#7fd8ff', '#cdf1ff', '#ffffff']);
        }
      }
    }
    game.items = game.items.filter((it) => it.x > -60 && !it.hit);

    // ডিম
    for (const e of game.eggs) {
      e.x += e.vx * dt;
      e.rot += e.spin * dt;
      const feet = laneFeet(e.lane);
      const dx = Math.abs(e.x - px);
      const dy = Math.abs(feet - py);

      // খুব কাছ দিয়ে গেলে বোনাস
      if (!e.hit && !e.near && dx < 60 * S && dx > 24 * S && dy < 40 * S) {
        e.near = true;
        game.dist += 10;
        addText(px + 30 * S, py - 100 * S, 'Close! +10', '#ff8fb1');
      }

      if (!e.hit && dx < 24 * S && dy < 24 * S) {
        e.hit = true;
        burst(e.x, feet - 30 * S);
        if (game.shield > 0) {
          game.shield -= 1;
          addText(px, py - 110 * S, 'Shield blocked!', '#7fd8ff');
          game.shake = 0.25;
          continue;
        }
        game.shake = 0.7;
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

  // ভাসমান লেখা, শেষ হয়ে এলে মুছে যায় (খেলা শেষ হলেও চলে)
  function updateEffects(dt) {
    game.shake = Math.max(0, game.shake - dt * 2.5);
    for (const t of game.texts) {
      t.y -= 40 * S * dt;
      t.life -= dt * 1.1;
    }
    game.texts = game.texts.filter((t) => t.life > 0);
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
      state: 'playing', dist: 0, coins: 0, shield: 0, speed: 170, time: 0,
      spawnT: 1, itemT: 1.5, phase: 0, throwT: 0, eggs: [], items: [],
      parts: [], texts: [], shake: 0, dustT: 0,
    });
    resetRunner();
    show(els.menu, false);
    show(els.over, false);
    show(els.pauseScreen, false);
    show(els.hud, true);
  }

  function endGame() {
    game.state = 'over';
    game.hold = { up: false, down: false, left: false, right: false };
    const score = Math.floor(game.dist);
    if (score > game.best) {
      game.best = score;
      saveBest(score);
    }
    els.overMsg.textContent = game.name + ', তোমার স্কোর ' + score + ' আর কয়েন ' + game.coins + '। আবার চেষ্টা করো!';
    els.overScore.textContent = score;
    els.overBest.textContent = game.best;
    show(els.hud, false);
    show(els.over, true);
  }

  function togglePause() {
    if (game.state === 'playing') {
      game.state = 'paused';
      game.hold = { up: false, down: false, left: false, right: false };
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
    // দিন-রাত চক্র: স্কোর বাড়ার সাথে আকাশের রঙ সন্ধ্যার দিকে যায়
    const t = 0.5 + 0.5 * Math.sin(game.dist * 0.004);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mixHex(DAY[0], DUSK[0], t));
    g.addColorStop(0.55, mixHex(DAY[1], DUSK[1], t));
    g.addColorStop(1, mixHex(DAY[2], DUSK[2], t));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // সূর্য (বা সন্ধ্যার লালচে সূর্য), হালকা পালস সহ
    const pulse = 1 + Math.sin(game.time * 1.5) * 0.03;
    const sx = W * 0.82, sy = H * 0.18, sr = 46 * S * pulse;
    const sunCol = mixHex('#ffe08a', '#ff9a6b', t);
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 2.6);
    glow.addColorStop(0, 'rgba(255, 230, 140, 0.55)');
    glow.addColorStop(1, 'rgba(255, 230, 140, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sunCol;
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
    const feet = game.chaserY;
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

    drawNameTag(x, feet - 92 * S, CHASER_NAME, '#ffb3c6');
  }

  function drawItems() {
    for (const it of game.items) {
      const feet = laneFeet(it.lane);
      const y = feet - 36 * S;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.beginPath();
      ctx.ellipse(it.x, feet + 2 * S, 9 * S, 2.5 * S, 0, 0, Math.PI * 2);
      ctx.fill();

      if (it.type === 'coin') {
        // কয়েন ঘুরছে
        const squash = Math.max(0.2, Math.abs(Math.cos(it.spin)));
        ctx.save();
        ctx.translate(it.x, y);
        ctx.scale(squash, 1);
        const g = ctx.createRadialGradient(-3 * S, -3 * S, 1 * S, 0, 0, 13 * S);
        g.addColorStop(0, '#fff4b0');
        g.addColorStop(1, '#ffb300');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 12 * S, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c98a00';
        ctx.lineWidth = 2 * S;
        ctx.stroke();
        ctx.restore();
      } else {
        // ঢাল: নীল আলো-করা বল, পালস সহ
        const pulse = 1 + Math.sin(game.time * 6 + it.spin) * 0.08;
        const g = ctx.createRadialGradient(0, 0, 2 * S, 0, 0, 16 * S * pulse);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.5, 'rgba(127, 216, 255, 0.9)');
        g.addColorStop(1, 'rgba(127, 216, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(it.x, y, 16 * S * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
    const x = game.px;
    const feet = game.py;
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

    // ঢাল থাকলে বুদবুদের বেষ্টনী
    if (game.shield > 0) {
      const pulse = 1 + Math.sin(game.time * 5) * 0.04;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, feet - 32 * S, 36 * S * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(127, 216, 255, 0.14)';
      ctx.fill();
      ctx.lineWidth = 3 * S;
      ctx.strokeStyle = 'rgba(127, 216, 255, 0.85)';
      ctx.stroke();
      ctx.restore();
    }

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

  function drawTexts() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.round(15 * S) + 'px sans-serif';
    for (const t of game.texts) {
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function draw() {
    document.body.dataset.state = game.state;

    // স্ক্রিন কাঁপানো (ডিম লাগলে)
    const sh = game.shake * 8 * S;
    ctx.save();
    if (sh > 0) ctx.translate(rand(-sh, sh), rand(-sh, sh));

    drawSky();
    drawClouds();
    drawHills();
    drawGround();
    drawChaser();
    drawItems();
    drawEggs();
    drawRunner();
    drawParticles();
    drawTexts();

    ctx.restore();

    els.dist.textContent = Math.floor(game.dist);
    els.coins.textContent = game.coins;
    els.shields.textContent = game.shield;
    els.best.textContent = game.best;
  }

  /* ---------- লুপ ও ইনপুট ---------- */

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    if (game.state === 'playing') update(dt);
    updateEffects(dt);
    const bgSpeed = game.state === 'playing' ? game.speed
      : game.state === 'paused' ? 0 : 110;
    updateBg(dt, bgSpeed);

    draw();
    requestAnimationFrame(loop);
  }

  // কিবোর্ড: তীর বা W A S D
  const KEYMAP = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  };

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
      if (document.activeElement === els.name) return;
      togglePause();
      return;
    }
    if (game.state !== 'playing') return;
    const dir = KEYMAP[k];
    if (dir) {
      e.preventDefault();
      game.hold[dir] = true;
    }
  });

  window.addEventListener('keyup', (e) => {
    const dir = KEYMAP[e.key];
    if (dir) game.hold[dir] = false;
  });

  // মাউস/আঙুল: যেখানে চাপবে রানার সেখানে যাবে, ধরে টানলে সে অনুসরণ করবে
  let activePtr = null;

  window.addEventListener('pointerdown', (e) => {
    if (game.state !== 'playing') return;
    if (e.target.closest && e.target.closest('button, input, .touchpad')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    activePtr = e.pointerId;
    setTarget(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('pointermove', (e) => {
    if (game.state !== 'playing' || e.pointerId !== activePtr) return;
    setTarget(e.clientX, e.clientY);
  }, { passive: true });

  const endPtr = (e) => { if (e.pointerId === activePtr) activePtr = null; };
  window.addEventListener('pointerup', endPtr);
  window.addEventListener('pointercancel', endPtr);

  // স্ক্রিনের ▲ ▼ ◀ ▶ বাটন: চেপে ধরে থাকলে চলবে
  function bindHold(id, dir) {
    const el = $(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); game.hold[dir] = true; };
    const off = () => { game.hold[dir] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }
  bindHold('upBtn', 'up');
  bindHold('downBtn', 'down');
  bindHold('leftBtn', 'left');
  bindHold('rightBtn', 'right');

  // iOS এ স্ক্রল/জুম আটকানো, দীর্ঘ চাপে মেনু বন্ধ
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

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