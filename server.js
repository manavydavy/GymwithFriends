// Gym with Friends online server.
// Serves the game page and runs every room's game loop. The server is the
// single source of truth for machines, towels, gains, strikes and the clock.
// Each browser moves its own player and runs its own rep timing bar, then tells
// the server what happened.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const S = require('./shared.js');
const C = S.CFG;
const PORT = process.env.PORT || 3000;
const TICK = 50; // ms: 20 updates a second
if (process.env.ROUND_LENGTH) C.roundLength = +process.env.ROUND_LENGTH; // handy for quick tests

// ---------- web server ----------
// The game page can sit next to server.js or inside a "public" folder. Either works.
const PAGE = fs.existsSync(path.join(__dirname, 'index.html')) ? 'index.html' : 'public/index.html';
const FILES = {
  '/': [PAGE, 'text/html; charset=utf-8'],
  '/index.html': [PAGE, 'text/html; charset=utf-8'],
  '/shared.js': ['shared.js', 'application/javascript; charset=utf-8'],
  '/models.js': ['models.js', 'application/javascript; charset=utf-8'],
  '/3d': ['3d.html', 'text/html; charset=utf-8'],
  '/3d.html': ['3d.html', 'text/html; charset=utf-8'],
  '/gym3d.js': ['gym3d.js', 'application/javascript; charset=utf-8'],
  '/view3d.js': ['view3d.js', 'application/javascript; charset=utf-8'],
  '/GLTFLoader.js': ['GLTFLoader.js', 'application/javascript; charset=utf-8'],
  '/DRACOLoader.js': ['DRACOLoader.js', 'application/javascript; charset=utf-8']
};
// 3D model files and the Draco decoder (simple names only, no sub-folders)
const TYPES = { jpg: 'image/jpeg', glb: 'model/gltf-binary', json: 'application/json', js: 'application/javascript; charset=utf-8', wasm: 'application/wasm' };
function lookup(u) {
  if (FILES[u]) return FILES[u];
  const m = u.match(/^\/(models|draco)\/([\w-]+)\.(glb|json|js|wasm|jpg)$/);
  return m ? [m[1] + '/' + m[2] + '.' + m[3], TYPES[m[3]]] : null;
}
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/health') { res.end('ok'); return; }
  const f = lookup(u);
  if (!f) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, f[0]), (err, data) => {
    if (err) { res.writeHead(500); res.end('Server error'); return; }
    res.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, path: '/ws' });

// ---------- rooms and players ----------
const rooms = new Map();
let nextId = 1;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = S.dist, useSpot = S.useSpot;
const BOT_NAMES = ['Bot 1', 'Bot 2', 'Bot 3'];

function makeRoom(code) {
  const r = {
    code, players: new Map(), st: 'lobby', t: 0, prog: S.PROGRAMS[0], gold: -1, pre: null, preT: 0,
    m: S.MACH.map(() => ({ user: null, claim: null })),
    staff: { x: S.STAFF_PATH[0][0], y: S.STAFF_PATH[0][1], i: 1, dir: 0, pause: 0 }, asks: [], ev: [], host: null, res: null,
    firstDone: false, warned: false
  };
  rooms.set(code, r);
  return r;
}

function freshStats() { return { shoves: 0, shoved: 0, steals: 0, perfects: 0, reps: 0, pulls: 0, strikes: 0, wipes: 0, misses: 0, golds: 0, pres: 0 }; }
function resetPlayer(p, i) {
  Object.assign(p, {
    x: S.SPAWN(i)[0], y: S.SPAWN(i)[1], on: null, stairCd: 0, posIgnore: 0, fat: 0, combo: 0, miss: 0, stun: 0, kvx: 0, kvy: 0,
    shoveCd: 0, askCd: 0, towelCd: 0, limp: 0, sprintT: 0, moveT: 0, sprinting: false, idle: 0, heat: 0, strikes: 0, gains: 0, claim: null, lock: 0,
    lastRep: 0, lastPos: Date.now(), done: false, goldN: 0, preT: 0, em: '', emT: 0, emCd: 0,
    grp: Object.fromEntries(S.GK.map(k => [k, { p: 0, pulled: false }])),
    stats: freshStats(), bt: {}
  });
  p.tp = (p.tp || 0) + 1;
}
function addPlayer(r, name, ws, bot) {
  const used = new Set([...r.players.values()].map(p => p.c));
  const p = { id: nextId++, ws, bot: !!bot, n: name, c: S.COLOURS.find(c => !used.has(c)) || S.COLOURS[0], tp: 0 };
  resetPlayer(p, r.players.size);
  r.players.set(p.id, p);
  if (!bot && (!r.host || !r.players.has(r.host))) r.host = p.id;
  return p;
}
function removePlayer(r, p) {
  stepOff(r, p); clearClaim(r, p);
  r.asks = r.asks.filter(q => q.by !== p.id && q.owner !== p.id);
  r.players.delete(p.id);
  const humans = [...r.players.values()].filter(x => !x.bot);
  if (!humans.length) { rooms.delete(r.code); return; }
  if (r.host === p.id) { r.host = humans[0].id; ev(r, { k: 'ban', s: humans[0].n + ' is now the host', c: '#8FB6FF' }); }
  if (!p.bot) ev(r, { k: 'ban', s: p.n + ' left the gym', c: '#ddd' });
}

// ---------- events shown in browsers ----------
function ev(r, e) { r.ev.push(e); }
function say(r, p, s, c) { ev(r, { k: 'pop', to: p.id, x: Math.round(p.x), y: Math.round(p.y - 32), s, c: c || '#ddd' }); }

// ---------- rules ----------
function stepOff(r, p) {
  if (p.on === null) return;
  const m = S.MACH[p.on];
  r.m[p.on].user = null; p.on = null; p.goldN = 0;
  const u = useSpot(m); p.x = u.x; p.y = u.y; p.tp++;
}
function clearClaim(r, p) {
  if (p.claim === null) return;
  const mm = r.m[p.claim];
  if (mm.claim && mm.claim.owner === p.id) mm.claim = null;
  p.claim = null;
}
function nearestMachine(p, maxD, f) {
  let best = -1, bd = maxD;
  S.MACH.forEach((m, i) => {
    if (f && !f(i)) return;
    const u = useSpot(m), d = dist(p.x, p.y, u.x, u.y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function hopOn(r, p, i) {
  const m = S.MACH[i];
  if (p.grp[m.g].pulled) { say(r, p, 'Your ' + S.GROUPS[m.g].n.toLowerCase() + ' is pulled. Train something else.', '#ff8a80'); return; }
  if (p.claim === i) { r.m[i].claim = null; p.claim = null; }
  r.asks = r.asks.filter(q => q.m !== i);
  r.m[i].user = p.id; p.on = i;
  p.x = m.x + m.w / 2; p.y = m.y + m.h / 2; p.tp++;
  p.idle = 0; p.miss = 0;
}
function strike(r, p, why) {
  p.strikes++; p.stats.strikes++;
  p.gains = Math.max(0, p.gains - C.strikePenalty);
  stepOff(r, p); clearClaim(r, p);
  p.lock = C.lockoutTime; p.heat = 35;
  ev(r, { k: 'ban', to: p.id, s: 'Strike: ' + why + ' (−' + C.strikePenalty + ')', c: '#ff8a80' });
  ev(r, { k: 'buzz', to: p.id, v: [60, 60, 60] });
  ev(r, { k: 'pop', x: Math.round(p.x), y: Math.round(p.y - 34), s: p.n + ' is getting a staff lecture', c: '#ff8a80' });
}
function programDone(r, p) { return r.prog.every(k => p.grp[k].p >= 100); }
// The golden machine: once someone finishes the program, one machine glows gold. Finished players bank
// C.goldBonus for C.goldReps reps on it (in one visit), then it jumps somewhere else.
function moveGold(r) {
  const from = r.gold >= 0 ? S.MACH[r.gold] : null;
  const ok = S.MACH.map((m, i) => i).filter(i => i !== r.gold && r.m[i].user === null && !r.m[i].claim);
  const far = from ? ok.filter(i => dist(S.MACH[i].x, S.MACH[i].y, from.x, from.y) > 600) : ok;
  const pool = far.length ? far : ok.length ? ok : S.MACH.map((m, i) => i);
  r.gold = pool[Math.floor(Math.random() * pool.length)];
  for (const q of r.players.values()) q.goldN = 0;
  ev(r, { k: 'gold', m: r.gold });
}

function act(r, p, a) {
  const isHost = p.id === r.host;
  if (a === 'start') { if (isHost && (r.st === 'lobby' || r.st === 'results')) startRound(r); return; }
  if (a === 'bot+') {
    const bots = [...r.players.values()].filter(x => x.bot);
    if (isHost && r.st !== 'playing' && bots.length < BOT_NAMES.length && r.players.size < C.maxPlayers) {
      const name = BOT_NAMES.find(n => !bots.some(b => b.n === n));
      addPlayer(r, name, null, true);
    }
    return;
  }
  if (a === 'bot-') { if (isHost && r.st !== 'playing') for (const x of [...r.players.values()]) if (x.bot) removePlayer(r, x); return; }
  if (r.st !== 'playing') return;

  if (a === 'answer') {
    const ask = r.asks.find(q => q.owner === p.id);
    if (!ask) return;
    r.asks = r.asks.filter(q => q !== ask);
    ev(r, { k: 'pop', x: Math.round(p.x), y: Math.round(p.y - 32), s: '"Yep, using it"', c: '#8FB6FF' });
    const by = r.players.get(ask.by);
    if (by) { by.askCd = C.askCooldown; ev(r, { k: 'ban', to: by.id, s: p.n + ' says they\'re using it', c: '#ffb070' }); }
    return;
  }
  if (p.lock > 0 || p.stun > 0) return;

  if (a === 'use') {
    if (p.on !== null) { stepOff(r, p); return; }
    const i = nearestMachine(p, 52);
    if (i < 0) { say(r, p, 'Get closer to a machine'); return; }
    const mm = r.m[i];
    if (mm.user !== null) { const u = r.players.get(mm.user); say(r, p, (u ? u.n : 'Someone') + ' is on it. Shove them?', '#ffb070'); return; }
    if (mm.claim && mm.claim.owner !== p.id) {
      if (r.asks.some(q => q.m === i)) return;
      if (p.askCd > 0) { say(r, p, 'They said they\'re using it', '#ffb070'); return; }
      r.asks.push({ by: p.id, owner: mm.claim.owner, m: i, t: C.askTime });
      ev(r, { k: 'pop', x: Math.round(p.x), y: Math.round(p.y - 32), s: '"Anyone using this?"', c: '#FFE29A' });
      ev(r, { k: 'buzz', to: mm.claim.owner, v: [40, 40, 40] });
      return;
    }
    hopOn(r, p, i);
    return;
  }

  if (a === 'wipe') {
    if (p.towelCd > 0) { say(r, p, 'Towel\'s still drying (' + Math.ceil(p.towelCd) + 's)'); return; }
    if (p.fat < 5) { say(r, p, 'You\'re not sweaty yet'); return; }
    if (p.claim !== null) say(r, p, 'Grabbed your towel back off your claim', '#ffb070');
    clearClaim(r, p);
    p.fat = Math.max(0, p.fat - C.wipeAmount);
    p.towelCd = C.wipeCooldown; p.stats.wipes++;
    ev(r, { k: 'steam', x: Math.round(p.x), y: Math.round(p.y) });
    ev(r, { k: 'pop', x: Math.round(p.x), y: Math.round(p.y - 34), s: 'Wiped down', c: '#BFE8FF' });
    return;
  }

  if (a === 'towel') {
    if (p.towelCd > 0) { say(r, p, 'Towel\'s still drying (' + Math.ceil(p.towelCd) + 's)'); return; }
    const i = nearestMachine(p, C.throwRange, j => {
      const mm = r.m[j];
      return mm.user === null && (!mm.claim || mm.claim.owner === p.id) && j !== p.on && j !== p.claim;
    });
    if (i < 0) { say(r, p, 'No free machine in range'); return; }
    clearClaim(r, p);
    r.m[i].claim = { owner: p.id, t: C.claimDuration };
    p.claim = i;
    const m = S.MACH[i];
    ev(r, { k: 'pop', x: m.x + m.w / 2, y: m.y - 12, s: p.n + ' claimed it', c: p.c });
    return;
  }

  if (a === 'shove') {
    if (p.on !== null) { say(r, p, 'Step off first'); return; }
    if (p.shoveCd > 0) { say(r, p, 'Catch your breath first'); return; }
    let tgt = null, bd = C.shoveRange, spot = null;
    for (const o of r.players.values()) {
      if (o === p || o.lock > 0) continue;
      let d = dist(p.x, p.y, o.x, o.y), sp = null;
      if (o.on !== null) { const u = useSpot(S.MACH[o.on]); const du = dist(p.x, p.y, u.x, u.y); if (du < d) { d = du; sp = u; } }
      if (d < bd) { bd = d; tgt = o; spot = sp; }
    }
    if (!tgt) { say(r, p, 'Nobody to shove'); return; }
    p.shoveCd = C.shoveCooldown; if (p.preT <= 0) p.fat = Math.min(99, p.fat + C.shoveFatigue);
    p.stats.shoves++; tgt.stats.shoved++;
    let ang;
    if (tgt.on !== null && spot) {
      const m = S.MACH[tgt.on];
      ang = Math.atan2(spot.y - (m.y + m.h / 2), spot.x - (m.x + m.w / 2)) + rnd(-0.7, 0.7);
    } else ang = Math.atan2(tgt.y - p.y, tgt.x - p.x) || -Math.PI / 2;
    stepOff(r, tgt);
    tgt.kvx = Math.cos(ang) * 340; tgt.kvy = Math.sin(ang) * 340;
    tgt.stun = C.shoveStun; tgt.combo = 0; tgt.tp++;
    r.asks = r.asks.filter(q => q.by !== tgt.id);
    ev(r, { k: 'pop', x: Math.round(tgt.x), y: Math.round(tgt.y - 30), s: 'SHOVED', c: '#fff' });
    ev(r, { k: 'ban', to: tgt.id, s: 'Shoved by ' + p.n + '!', c: '#ff8a80' });
    ev(r, { k: 'buzz', to: tgt.id, v: 80 });
    if (S.staffSees(r.staff, p.x, p.y)) strike(r, p, 'staff saw that shove');
  }
}

function rep(r, p, q) {
  if (r.st !== 'playing' || p.on === null || p.lock > 0) return;
  const now = Date.now();
  if (now - p.lastRep < 200) return;
  p.lastRep = now; p.idle = 0;
  const m = S.MACH[p.on];
  if (q !== 'perfect' && q !== 'good') {
    p.combo = 0; p.miss++; p.stats.misses++;
    if (p.miss >= 3) { say(r, p, 'Dropped the bar!', '#ff8a80'); stepOff(r, p); }
    return;
  }
  const perfect = q === 'perfect';
  p.combo++; p.miss = 0; p.stats.reps++; if (perfect) p.stats.perfects++;
  const g = p.grp[m.g], before = g.p;
  if (p.done && p.on === r.gold) {
    // golden machine: full gains, no muscle progress (so no pulled muscles), counts toward the bonus
    const gain = Math.round(10 * (1 + Math.min(p.combo, 10) * 0.1) * (perfect ? 1.5 : 1) + (perfect ? C.perfectBonus : 0));
    p.gains += gain; p.goldN++;
    ev(r, { k: 'pop', to: p.id, x: Math.round(p.x), y: Math.round(p.y - 46), s: 'Gold ' + p.goldN + '/' + C.goldReps + '  +' + gain, c: '#FFC93C' });
    if (p.goldN >= C.goldReps) {
      p.gains += C.goldBonus; p.stats.golds++;
      ev(r, { k: 'ban', s: p.n + ' banked the golden machine! +' + C.goldBonus, c: '#FFC93C' });
      moveGold(r);
    }
  } else {
  g.p += C.groupPerRep * (perfect ? 1.5 : 1);
  const onProg = r.prog.includes(m.g);
  const gain = Math.max(1, Math.round(10 * (1 + Math.min(p.combo, 10) * 0.1) * (perfect ? 1.5 : 1) * (before >= 100 ? 0.3 : 1) * (onProg ? 1 : C.offProgramGains) + (perfect ? C.perfectBonus : 0)));
  p.gains += gain;
  ev(r, { k: 'pop', to: p.id, x: Math.round(p.x), y: Math.round(p.y - 46), s: (perfect ? 'Perfect +' : '+') + gain, c: perfect ? '#FFC93C' : '#9BE89F' });
  }
  if (before < 100 && g.p >= 100) {
    ev(r, { k: 'ban', to: p.id, s: S.GROUPS[m.g].n + ' done!', c: '#9BE89F' });
    if (!p.done && programDone(r, p)) {
      p.done = true;
      const bonus = C.programBonus + (r.firstDone ? 0 : C.firstBonus);
      p.gains += bonus;
      if (!r.firstDone) { r.firstDone = true; ev(r, { k: 'ban', s: p.n + ' finished the program first! +' + bonus, c: '#FFC93C' }); }
      else ev(r, { k: 'ban', to: p.id, s: 'Program done! +' + bonus, c: '#9BE89F' });
      if (r.gold < 0) moveGold(r);
    }
  }
  const warnAt = 100 + (C.overdoAt - 100) * 0.4;
  if (before < warnAt && g.p >= warnAt) say(r, p, 'Overdoing it!', '#ff8a80');
  if (g.p >= C.overdoAt) {
    g.pulled = true; p.limp = C.limpTime; p.stats.pulls++;
    p.gains = Math.max(0, p.gains - C.pullPenalty); p.combo = 0;
    ev(r, { k: 'ban', to: p.id, s: 'Pulled your ' + S.GROUPS[m.g].n.toLowerCase() + '! −' + C.pullPenalty, c: '#ff8a80' });
    ev(r, { k: 'pop', x: Math.round(p.x), y: Math.round(p.y - 34), s: p.n + ' pulled something', c: '#ff8a80' });
    stepOff(r, p);
    return;
  }
  if (p.preT <= 0) p.fat += C.fatiguePerRep;
  if (p.fat >= 100) {
    p.fat = 100; p.combo = 0;
    say(r, p, 'Gassed!', '#ff8a80'); ev(r, { k: 'buzz', to: p.id, v: 120 });
    stepOff(r, p); p.stun = 2;
  }
}

function movePlayer(r, p, x, y) {
  if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return;
  const now = Date.now();
  const dt = Math.min(0.5, (now - p.lastPos) / 1000);
  p.lastPos = now;
  if (r.st !== 'playing' || p.on !== null || p.stun > 0 || p.lock > 0 || p.posIgnore > 0) return;
  // The browser took the stairs a moment before the server did: follow it if it's next to a staircase
  if (S.floorOf(x) !== S.floorOf(p.x)) {
    const st = S.STAIRS.find(t => t.floor === S.floorOf(x) && dist(p.x, p.y, t.x + t.w / 2, t.y + t.h / 2) < 170);
    if (st && p.stairCd <= 0) { [p.x, p.y] = S.stairDest(st, p.x); p.stairCd = 0.8; p.posIgnore = 0.2; say(r, p, st.floor ? 'Upstairs: chest floor' : 'Ground floor', '#BFE8FF'); }
    return;
  }
  // Trust the browser's movement, but not faster than walking speed.
  const max = C.playerSpeed * (canSprint(p) && p.sprintT > 0 ? C.sprintMult : 1) * (p.limp > 0 ? 0.55 : 1) * dt * 1.5 + 12;
  let dx = x - p.x, dy = y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > max) { dx = dx / d * max; dy = dy / d * max; if (d > max + 60) p.tp++; }
  if (d > 1) p.moveT = 0.25;
  p.x += dx; p.y += dy;
  S.collide(p);
}
const canSprint = p => p.on === null && p.limp <= 0 && p.fat < 100 && p.stun <= 0 && p.lock <= 0;

function emote(r, p, e) {
  const s = S.EMOTES[e | 0];
  if (!s || p.emCd > 0) return;
  p.em = s; p.emT = 2.5; p.emCd = 1;
}

// ---------- bots (server-controlled players) ----------
const route = S.route;
// After going up or down stairs, skip waypoints that were on the old floor
function trimPath(p) { const b = p.bt; if (!b.path) return; const f = S.floorOf(p.x); while (b.path.length && S.floorOf(b.path[0][0]) !== f) b.path.shift(); }
function botThink(r, p, dt) {
  const b = p.bt;
  const ask = r.asks.find(q => q.owner === p.id);
  if (ask) {
    if (b.askRef !== ask) { b.askRef = ask; b.askT = 0; b.answerAt = Math.random() < 0.6 ? rnd(0.6, 2.2) : 99; }
    b.askT += dt;
    if (b.askT >= b.answerAt) act(r, p, 'answer');
  }
  if (p.lock > 0 || p.stun > 0) { b.path = null; return; }
  if (p.on !== null) {
    b.path = null;
    b.repT = (b.repT || 0) - dt;
    if (b.repT <= 0) { b.repT = rnd(0.45, 0.9); const roll = Math.random(); rep(r, p, roll < 0.2 ? 'perfect' : roll < 0.85 ? 'good' : 'miss'); }
    if (p.on === null) return;
    const g = p.grp[S.MACH[p.on].g];
    if (b.wiper === undefined) b.wiper = Math.random() < 0.5; // half the bots prefer wiping down
    if (b.wiper && p.fat > 70 && p.towelCd <= 0 && Math.random() < dt * 3) act(r, p, 'wipe');
    if (p.fat > 50 && p.claim === null && p.towelCd <= 0 && !b.wiper && Math.random() < dt * 2) act(r, p, 'towel');
    const onGold = p.done && p.on === r.gold;
    if (p.fat > 78 || (!onGold && g.p >= 100 && Math.random() < dt * 1.5)) act(r, p, 'use');
    return;
  }
  // grab a nearby pre-workout
  if (r.pre && b.goal !== 'pre' && S.floorOf(p.x) === S.floorOf(r.pre.x) && dist(p.x, p.y, r.pre.x, r.pre.y) < 320 && p.preT <= 0) { b.goal = 'pre'; b.path = route(p.x, p.y, r.pre.x, r.pre.y); }
  if (b.goal === 'pre' && !r.pre) b.path = null;
  // pick a goal
  if (!b.path) {
    b.stuck = 0;
    if (p.fat > 40 && p.towelCd <= 0 && b.wiper) act(r, p, 'wipe');
    if (p.fat > 40) {
      let best = S.REST[0], bd = 1e9;
      for (const z of S.REST) { if (S.floorOf(z.x) !== S.floorOf(p.x)) continue; const d = dist(p.x, p.y, z.x, z.y) * (S.zoneOf(z.x, z.y) === S.zoneOf(p.x, p.y) ? 0.5 : 1); if (d < bd) { bd = d; best = z; } }
      b.goal = 'rest'; b.path = route(p.x, p.y, best.x + rnd(-20, 20), best.y + rnd(-20, 20));
    } else {
      let target = p.claim;
      if (p.done && r.gold >= 0 && p.fat < 20) target = r.gold;
      if (target === null) {
        const wants = S.MACH.map((m, i) => i).filter(i => {
          const m = S.MACH[i], g = p.grp[m.g];
          return !g.pulled && g.p < 100 && (r.prog.includes(m.g) || p.done);
        });
        const free = wants.filter(i => r.m[i].user === null && (!r.m[i].claim || r.m[i].claim.owner === p.id));
        const busy = wants.filter(i => r.m[i].user !== null);
        const pool = (busy.length && Math.random() < 0.25) || !free.length ? (busy.length ? busy : wants) : free;
        target = pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * S.MACH.length);
      }
      const u = useSpot(S.MACH[target]);
      b.goal = target; b.path = route(p.x, p.y, u.x, u.y);
    }
  }
  if (b.goal === 'pre' && b.path.length === 0) { b.path = null; b.goal = null; return; }
  if (b.goal === 'rest' && b.path.length === 0) {
    if (p.fat <= 5) b.path = null;
    return;
  }
  if (b.path.length) {
    const [tx, ty] = b.path[0];
    const d = dist(p.x, p.y, tx, ty);
    if (d < 6) { b.path.shift(); return; }
    // bots sprint on long trips while they're fresh
    if (b.path.length >= 3 && p.fat < 25 && canSprint(p)) { p.sprintT = 0.3; p.moveT = 0.25; }
    const sp = C.playerSpeed * 0.9 * (p.sprintT > 0 && canSprint(p) ? C.sprintMult : 1) * (p.limp > 0 ? 0.55 : 1) * dt;
    const ox = p.x, oy = p.y;
    p.x += (tx - p.x) / d * Math.min(d, sp); p.y += (ty - p.y) / d * Math.min(d, sp);
    S.collide(p);
    if (dist(ox, oy, p.x, p.y) < sp * 0.2) { b.stuck += dt; if (b.stuck > 1.5) b.path = null; } else b.stuck = 0;
    return;
  }
  // arrived at a machine
  const i = b.goal, mm = r.m[i];
  b.path = null;
  if (mm.user !== null && mm.user !== p.id) { if (p.shoveCd <= 0 && Math.random() < 0.5) act(r, p, 'shove'); return; }
  act(r, p, 'use');
}

// ---------- round flow ----------
function startRound(r) {
  r.st = 'countdown'; r.t = C.countdown; r.res = null;
  r.prog = S.PROGRAMS[Math.floor(Math.random() * S.PROGRAMS.length)];
  r.m.forEach(m => { m.user = null; m.claim = null; });
  r.asks = []; r.firstDone = false; r.warned = false; r.gold = -1; r.pre = null; r.preT = rnd(10, 16);
  r.staff = { x: S.STAFF_PATH[0][0], y: S.STAFF_PATH[0][1], i: 1, dir: 0, pause: 0 };
  let i = 0;
  for (const p of r.players.values()) resetPlayer(p, i++);
}
function endRound(r) {
  r.st = 'results'; r.t = 0;
  for (const p of r.players.values()) { stepOff(r, p); clearClaim(r, p); }
  r.asks = [];
  const ps = [...r.players.values()];
  const rank = ps.slice().sort((a, b) => b.gains - a.gains).map(p => ({ id: p.id, n: p.n, c: p.c, g: p.gains, dn: p.done ? 1 : 0, b: p.bot ? 1 : 0 }));
  const awards = [];
  const award = (t, key, fmt) => {
    const top = ps.slice().sort((a, b) => b.stats[key] - a.stats[key])[0];
    if (top && top.stats[key] > 0) awards.push({ t, n: top.n, v: fmt(top.stats[key]) });
  };
  award('Most shoves', 'shoves', v => v + (v === 1 ? ' shove' : ' shoves'));
  award('Biggest thief', 'steals', v => v + (v === 1 ? ' machine nicked' : ' machines nicked'));
  award('Perfectionist', 'perfects', v => v + ' perfect reps');
  award('Pre-workout fiend', 'pres', v => v + (v === 1 ? ' tub' : ' tubs'));
  award('Gold digger', 'golds', v => v + (v === 1 ? ' golden machine' : ' golden machines'));
  award('Punching bag', 'shoved', v => 'shoved ' + v + (v === 1 ? ' time' : ' times'));
  award('Pulled something', 'pulls', v => v + (v === 1 ? ' muscle' : ' muscles'));
  award("Staff's favourite", 'strikes', v => v + (v === 1 ? ' strike' : ' strikes'));
  award('Sweatiest towel', 'wipes', v => v + (v === 1 ? ' wipe down' : ' wipe downs'));
  r.res = { rank, awards };
}

function tick(r, dt) {
  for (const p of r.players.values()) { p.emT = Math.max(0, p.emT - dt); p.emCd = Math.max(0, p.emCd - dt); }
  if (r.st === 'countdown') {
    r.t -= dt;
    if (r.t <= 0) {
      r.st = 'playing'; r.t = C.roundLength;
      for (const p of r.players.values()) p.lastPos = Date.now();
      ev(r, { k: 'ban', s: 'Go!', c: '#FFC93C' });
    }
    return;
  }
  if (r.st !== 'playing') return;
  r.t -= dt;
  if (r.t <= 0) { endRound(r); return; }
  if (!r.warned && r.t <= 30) { r.warned = true; ev(r, { k: 'ban', s: 'Gym closing in 30 seconds', c: '#FFC93C' }); }

  for (const p of r.players.values()) {
    p.stun = Math.max(0, p.stun - dt); p.lock = Math.max(0, p.lock - dt);
    p.shoveCd = Math.max(0, p.shoveCd - dt); p.askCd = Math.max(0, p.askCd - dt); p.towelCd = Math.max(0, p.towelCd - dt); p.stairCd = Math.max(0, p.stairCd - dt); p.posIgnore = Math.max(0, p.posIgnore - dt); p.limp = Math.max(0, p.limp - dt);
    if (p.stun > 0 && (Math.abs(p.kvx) > 5 || Math.abs(p.kvy) > 5)) {
      p.x += p.kvx * dt; p.y += p.kvy * dt;
      p.kvx *= Math.pow(0.03, dt); p.kvy *= Math.pow(0.03, dt);
      S.collide(p);
    }
    if (p.on === null && p.stun <= 0 && p.lock <= 0 && p.stairCd <= 0) {
      const st = S.stairAt(p.x, p.y);
      if (st) {
        [p.x, p.y] = S.stairDest(st, p.x); p.tp++; p.stairCd = 0.8; p.posIgnore = 0.35;
        say(r, p, st.floor ? 'Upstairs: chest floor' : 'Ground floor', '#BFE8FF');
        if (p.bot) trimPath(p);
      }
    }
    const resting = p.on === null && S.inRest(p.x, p.y);
    p.sprintT = Math.max(0, p.sprintT - dt); p.moveT = Math.max(0, p.moveT - dt);
    p.sprinting = r.st === 'playing' && canSprint(p) && p.sprintT > 0 && p.moveT > 0;
    if (p.sprinting) {
      // sprinting burns fatigue instead of recovering it; max it out and you're gassed on the spot
      if (p.preT <= 0) p.fat = Math.min(100, p.fat + C.sprintFatigue * dt);
      if (p.fat >= 100) { p.sprinting = false; p.sprintT = 0; p.stun = 2; p.combo = 0; say(r, p, 'Gassed!', '#ff8a80'); ev(r, { k: 'buzz', to: p.id, v: 120 }); }
    }
    p.recov = r.st === 'playing' && !p.sprinting && resting && p.fat > 0.5;   // cooling off in a rest area (splash effects)
    if (!p.sprinting && p.on === null) p.fat = Math.max(0, p.fat - (resting ? C.recoverRest : C.recoverWalk) * dt);
    else p.idle += dt;
    // hog heat: sitting idle on a machine, or leaving your towel while wandering
    let heating = 0;
    if (p.on !== null && p.idle > 2.5) heating = C.heatRate;
    if (p.claim !== null && p.on === null && !resting) heating += C.heatRate * 0.3;
    p.heat = heating ? Math.min(100, p.heat + heating * dt) : Math.max(0, p.heat - 8 * dt);
    if (p.heat >= 100) strike(r, p, 'caught hogging');
    if (p.claim !== null) {
      const c = r.m[p.claim].claim;
      if (!c || c.owner !== p.id) p.claim = null;
      else {
        c.t -= dt * (p.on !== null || resting ? 1 : 2.5);
        if (c.t <= 0) { r.m[p.claim].claim = null; p.claim = null; say(r, p, 'Towel claim expired'); }
      }
    }
    if (p.bot) botThink(r, p, dt);
  }

  // "Anyone using this?"
  for (const q of r.asks.slice()) {
    const by = r.players.get(q.by), owner = r.players.get(q.owner), mm = r.m[q.m];
    const u = useSpot(S.MACH[q.m]);
    if (!by || !owner || !mm.claim || mm.claim.owner !== q.owner || by.on !== null || dist(by.x, by.y, u.x, u.y) > 90) {
      r.asks = r.asks.filter(x => x !== q); continue;
    }
    q.t -= dt;
    if (q.t <= 0) {
      r.asks = r.asks.filter(x => x !== q);
      clearClaim(r, owner);
      by.stats.steals++;
      ev(r, { k: 'ban', to: owner.id, s: by.n + ' nicked your ' + S.MACH[q.m].name + '!', c: '#ff8a80' });
      ev(r, { k: 'pop', x: u.x, y: u.y - 40, s: 'Nicked!', c: '#FFC93C' });
      if (mm.user === null && by.lock <= 0 && by.stun <= 0) hopOn(r, by, q.m);
    }
  }

  // pre-workout power-up: drops somewhere random, first to walk over it gets no fatigue gain for a while
  for (const p of r.players.values()) p.preT = Math.max(0, p.preT - dt);
  if (!r.pre) { r.preT -= dt; if (r.preT <= 0) r.pre = preSpot(r); }
  else {
    for (const p of r.players.values()) {
      if (p.on !== null || p.stun > 0 || S.floorOf(p.x) !== S.floorOf(r.pre.x) || dist(p.x, p.y, r.pre.x, r.pre.y) > 34) continue;
      p.preT = C.preDuration; p.stats.pres++;
      ev(r, { k: 'ban', s: p.n + ' necked the pre-workout! No fatigue for ' + C.preDuration + 's', c: '#FF5FC8' });
      ev(r, { k: 'pre', x: Math.round(r.pre.x), y: Math.round(r.pre.y) });
      r.pre = null; r.preT = rnd(C.preEvery[0], C.preEvery[1]);
      break;
    }
  }

  // staff patrol
  S.stepStaff(r.staff, dt);
}
// A random open spot on the floor: not inside anything, not on a rest circle or the stairs, not under the
// mezzanine (you couldn't see it there), and not right next to anyone
function preSpot(r) {
  for (let i = 0; i < 80; i++) {
    const up = Math.random() < 0.18, f = S.FLOORS[up ? 1 : 0];
    const o = { x: f.x + 40 + Math.random() * (f.w - 80), y: 90 + Math.random() * (f.h - 130) };
    const x = o.x, y = o.y; S.collide(o);
    if (Math.abs(o.x - x) > 0.5 || Math.abs(o.y - y) > 0.5) continue;
    if (S.inRest(x, y) || S.zoneOf(x, y) === 'stairs' || S.stairAt(x, y)) continue;
    if (!up && x < 720 && y < 540) continue;
    if (S.WALLS.some(w => x > w.x - 20 && x < w.x + w.w + 20 && y > w.y - 20 && y < w.y + w.h + 20)) continue;
    if ([...r.players.values()].some(p => dist(p.x, p.y, x, y) < 160)) continue;
    return { x: Math.round(x), y: Math.round(y) };
  }
  return null;
}

function snapshot(r) {
  const P = [];
  for (const p of r.players.values()) {
    P.push({
      id: p.id, n: p.n, c: p.c, b: p.bot ? 1 : 0, x: Math.round(p.x), y: Math.round(p.y), on: p.on,
      ft: Math.round(p.fat), lk: p.on !== null || p.stun > 0 || p.lock > 0 ? 1 : 0, st: p.stun > 0 ? 1 : 0, lo: p.lock > 0 ? 1 : 0,
      tp: p.tp, lm: p.limp > 0 ? 1 : 0, sp: p.sprinting ? 1 : 0, g: p.gains, gr: S.GK.map(k => Math.round(p.grp[k].p)), pl: S.GK.map(k => (p.grp[k].pulled ? 1 : 0)),
      hz: Math.round(p.heat), sk: p.strikes, cl: p.claim, dn: p.done ? 1 : 0, em: p.emT > 0 ? p.em : '', sc: Math.ceil(p.shoveCd), ac: Math.ceil(p.askCd), tc: Math.ceil(p.towelCd), gn: p.goldN, pw: Math.ceil(p.preT), rs: p.recov ? 1 : 0, rc: p.stats.reps, mc: p.stats.misses
    });
  }
  const msg = JSON.stringify({
    t: 'snap', st: r.st, tm: Math.round(r.t * 10) / 10, pg: r.prog, gm: r.st === 'playing' ? r.gold : -1, pr: r.st === 'playing' && r.pre ? [r.pre.x, r.pre.y] : null, host: r.host, code: r.code,
    sf: [Math.round(r.staff.x), Math.round(r.staff.y), Math.round(r.staff.dir * 100) / 100],
    m: r.m.map(m => [m.user, m.claim ? m.claim.owner : null, m.claim ? Math.round(m.claim.t * 10) / 10 : 0]),
    p: P, ak: r.asks.map(q => ({ by: q.by, ow: q.owner, m: q.m, t: Math.round(q.t * 10) / 10 })),
    ev: r.ev, res: r.st === 'results' ? r.res : null
  });
  r.ev = [];
  for (const p of r.players.values()) if (!p.bot && p.ws.readyState === 1) p.ws.send(msg);
}

// ---------- connections ----------
wss.on('connection', ws => {
  let r = null, p = null;
  ws.on('message', buf => {
    let d;
    try { d = JSON.parse(buf); } catch (e) { return; }
    if (!d || typeof d !== 'object') return;
    if (!p) {
      if (d.t !== 'join') return;
      const code = String(d.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (!code) { ws.send(JSON.stringify({ t: 'err', s: 'That room code is not valid.' })); return; }
      const room = rooms.get(code) || makeRoom(code);
      if (room.players.size >= C.maxPlayers) { ws.send(JSON.stringify({ t: 'err', s: 'That room is full (' + C.maxPlayers + ' max).' })); return; }
      r = room;
      p = addPlayer(r, String(d.name || '').replace(/[<>]/g, '').trim().slice(0, 14) || 'Gym rat', ws, false);
      ws.send(JSON.stringify({ t: 'welcome', id: p.id, code }));
      ev(r, { k: 'ban', s: p.n + ' walked in', c: '#8FB6FF' });
      return;
    }
    if (d.t === 'tp' && process.env.GC_DEBUG && typeof d.x === 'number' && typeof d.y === 'number') { p.x = d.x; p.y = d.y; p.lastPos = Date.now(); if (typeof d.ft === 'number') p.fat = d.ft; }   // screenshots only
    if (d.t === 'pos') { p.sprintT = d.s ? 0.3 : 0; movePlayer(r, p, d.x, d.y); }
    else if (d.t === 'act') act(r, p, String(d.a));
    else if (d.t === 'rep') rep(r, p, d.q);
    else if (d.t === 'emote') emote(r, p, d.e);
  });
  ws.on('close', () => { if (r && p) removePlayer(r, p); });
  ws.on('error', () => {});
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.2, (now - lastTick) / 1000);
  lastTick = now;
  for (const r of rooms.values()) { tick(r, dt); if (rooms.has(r.code)) snapshot(r); }
}, TICK);

server.listen(PORT, () => console.log('Gym with Friends running on port ' + PORT));
