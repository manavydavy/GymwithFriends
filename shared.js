// Shared between the server (Node) and the browser.
// Map layout, rules config and collision live here so both sides agree.
(function (out) {
  // ---- Tuning: every gameplay number lives here ----
  const CFG = {
    roundLength: 160,      // seconds per round (2:40)
    countdown: 5,          // "get ready" seconds before each round
    wipeCooldown: 20,      // towel unusable for this long after a wipe down
    wipeAmount: 100,       // fatigue removed by a wipe down
    maxPlayers: 6,
    fatiguePerRep: 16,
    recoverWalk: 7,        // fatigue lost per second while walking
    recoverRest: 40,       // ...while at a fountain or the stretch mat
    groupPerRep: 9,        // % muscle progress per good rep
    overdoAt: 135,         // % where you pull the muscle
    offProgramGains: 0.5,  // gains multiplier for muscles not on today's program
    markerSpeed: 2.6,
    zoneWidth: 0.32,
    perfectWidth: 0.07,
    throwRange: 240,
    claimDuration: 25,
    askTime: 3,            // seconds to answer "anyone using this?"
    askCooldown: 3,
    shoveRange: 48,
    shoveFatigue: 22,
    shoveCooldown: 3,
    shoveStun: 1.3,
    heatRate: 16,
    staffSight: 260,       // how far staff can see (map units)
    staffFov: 100,         // width of the staff vision cone in degrees
    staffSpeed: 80,
    staffScan: 2.6,        // seconds staff spend looking around at each lookout point
    playerSpeed: 185,
    goldReps: 5,           // after finishing the program: this many reps on the golden machine...
    goldBonus: 150,        // ...banks this bonus, then the golden machine moves
    sprintMult: 1.6,       // hold Shift: this much faster...
    sprintFatigue: 20,     // ...but fatigue climbs this much per second (no recovery). Hit 100 and you're gassed
    limpTime: 25,
    programBonus: 300,
    firstBonus: 150,
    strikePenalty: 100,
    pullPenalty: 100,
    lockoutTime: 4         // seconds frozen by a staff lecture
  };

  // Map: ground floor (0..1800 x 0..1100) and an upstairs mezzanine stored off to the right (2000..2700 x 0..520).
  const W = 2700, H = 1100;
  const FLOORS = [
    { id: 0, n: 'Ground floor', x: 0, y: 0, w: 1800, h: 1100 },
    { id: 1, n: 'Upstairs', x: 2000, y: 0, w: 700, h: 520, elev: 3.6 }
  ];
  const GROUPS = {
    chest: { n: 'Chest', c: '#E2544B' },
    back: { n: 'Back', c: '#2FA39A' },
    shoulders: { n: 'Shoulders', c: '#E8A23A' },
    arms: { n: 'Arms', c: '#9C6ADE' },
    legs: { n: 'Legs', c: '#D45F9A' }
  };
  const GK = Object.keys(GROUPS);
  // Big Gaz picks one of these each round. Everyone gets the same program.
  const PROGRAMS = [
    ['chest', 'back', 'legs'],
    ['shoulders', 'arms', 'legs'],
    ['chest', 'shoulders', 'arms'],
    ['back', 'arms', 'legs'],
    ['chest', 'back', 'shoulders']
  ];
  const MACH = [
    ['Flat bench', 'chest', 2240, 100, 110, 50, 1],
    ['Incline bench', 'chest', 2420, 100, 110, 50, 1.05],
    ['Dumbbell rack', 'arms', 300, 400, 170, 40, 0.95],
    ['Preacher curl', 'arms', 600, 420, 80, 60, 1],
    ['Squat rack 1', 'legs', 1220, 90, 90, 90, 1.3],
    ['Squat rack 2', 'legs', 1380, 90, 90, 90, 1.3],
    ['Smith machine', 'shoulders', 820, 400, 110, 90, 1.15],
    ['Pec deck', 'chest', 2580, 90, 90, 70, 0.9],
    ['Shoulder press', 'shoulders', 400, 620, 90, 70, 1],
    ['Lat pulldown', 'back', 140, 100, 90, 70, 1],
    ['Seated row', 'back', 470, 100, 100, 70, 0.95],
    ['Cable stack', 'back', 800, 90, 110, 80, 0.9],
    ['Leg press', 'legs', 1540, 90, 110, 80, 1.15],
    ['Leg extension', 'legs', 1690, 90, 90, 70, 1],
    ['Lateral raise', 'shoulders', 640, 620, 90, 70, 1]
  ].map((a, i) => ({ id: i, name: a[0], g: a[1], x: a[2], y: a[3], w: a[4], h: a[5], spd: a[6] }));
  // Areas (floor colour + painted name)
  const ZONES = [
    { n: 'Cable alley', x: 0, y: 0, w: 1150, h: 308, floor: '#38454F' },
    { n: 'Main hall', x: 0, y: 308, w: 1150, h: 792, floor: '#3B4252' },
    { n: 'Stairs', x: 0, y: 520, w: 200, h: 580, floor: '#4B505C' },
    { n: 'Corridor', x: 1180, y: 380, w: 150, h: 720, floor: '#444A57' },
    { n: 'Leg room', x: 1180, y: 0, w: 620, h: 380, floor: '#47394A' },
    { n: 'Chest floor', x: 2000, y: 0, w: 700, h: 520, floor: '#4A3A3D' }
  ];
  // Solid walls. t: wall (full height), half (waist-high), rail (railing), lockers (closed block)
  const WALLS = [
    { x: 1150, y: 0, w: 30, h: 900, t: 'wall' },
    { x: 1330, y: 380, w: 470, h: 720, t: 'lockers' },
    { x: 0, y: 300, w: 420, h: 16, t: 'half' }, { x: 560, y: 300, w: 260, h: 16, t: 'half' }, { x: 960, y: 300, w: 190, h: 16, t: 'half' },
    { x: 0, y: 500, w: 214, h: 20, t: 'wall' },
    { x: 200, y: 520, w: 14, h: 480, t: 'rail' },
    { x: 2200, y: 506, w: 500, h: 14, t: 'rail' }
  ];
  // Walking into a trigger moves you between floors
  const STAIRS = [
    { x: 0, y: 520, w: 200, h: 50, to: [2100, 468], floor: 1, n: 'Up to the chest floor' },
    { x: 2000, y: 498, w: 200, h: 22, to: [100, 615], floor: 0, n: 'Back downstairs' }
  ];
  const TREADS = [0, 1, 2].map(i => ({ x: 2260 + i * 110, y: 300, w: 80, h: 120 }));
  const DESK = { x: 760, y: 960, w: 240, h: 60 };
  const SOLIDS = [...MACH, ...TREADS, DESK, ...WALLS];
  const REST = [
    { x: 930, y: 720, r: 92, n: 'Stretch mat' },
    { x: 1090, y: 200, r: 52, n: 'Fountain' },
    { x: 1610, y: 318, r: 52, n: 'Fountain' },
    { x: 2640, y: 400, r: 52, n: 'Fountain' }
  ];
  const DOOR = { x: 1080, y: 1100 };
  const SPAWN = i => [1130 - (i % 8) * 34, 1062];
  // Staff patrol (ground floor only, so upstairs has no staff). 'scan' = stop and look all the way around.
  const STAFF_PATH = [[1050, 880], [980, 560, 'scan'], [890, 350], [890, 250, 'scan'], [490, 250, 'scan'], [200, 250, 'scan'], [490, 250], [490, 350], [560, 560, 'scan'],
    [700, 860], [1050, 880], [1255, 1000], [1255, 300, 'scan'], [1600, 260, 'scan'], [1255, 300], [1255, 1000]];
  // Walking graph for practice dummies. Directed pairs go through the stair triggers.
  const NAV = {
    A: [680, 780], B: [300, 780], Q: [300, 1060], H: [1050, 880], C: [490, 350], D: [890, 350], E: [490, 250], F: [890, 250], G: [180, 240],
    K1: [1255, 1000], K2: [1255, 430], LR: [1480, 260], L: [100, 1060], M: [100, 620], SG: [100, 540], N: [2100, 450], SU: [2100, 512], O: [2380, 240], P: [2620, 240]
  };
  const NAV_EDGES = [['A', 'B'], ['A', 'H'], ['B', 'Q'], ['Q', 'L'], ['Q', 'H'], ['L', 'M'], ['C', 'A'], ['D', 'A'], ['C', 'B'], ['D', 'H'], ['C', 'E'], ['D', 'F'], ['E', 'F'], ['E', 'G'],
    ['H', 'K1'], ['K1', 'K2'], ['K2', 'LR'], ['N', 'O'], ['O', 'P'], ['M>SG'], ['SG>N'], ['N>SU'], ['SU>M']];
  const zoneOf = (x, y) => x >= 1900 ? 'up' : (x < 200 && y > 520) ? 'stairs' : (x >= 1180 && y < 380) ? 'legs' : x >= 1180 ? 'corr' : y < 308 ? 'alley' : 'main';
  const floorOf = x => (x >= 1900 ? 1 : 0);
  const COLOURS = ['#3C82FF', '#E2544B', '#2FBF71', '#FFC93C', '#B07CFF', '#FF7AC8'];
  const EMOTES = ['How many sets left?', 'Mine.', 'Spot me?', 'Lightweight!'];

  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
  const useSpot = m => ({ x: m.x + m.w / 2, y: m.y + m.h + 22 });
  const inRest = (x, y) => REST.some(r => dist(x, y, r.x, r.y) < r.r);
  const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const stairAt = (x, y) => STAIRS.find(s => inRect(x, y, s));
  // Shortest route through the walking graph (breadth-first). Returns a list of [x, y] points.
  function route(x, y, tx, ty) {
    const za = zoneOf(x, y), zb = zoneOf(tx, ty);
    if (za === zb && za !== 'stairs') return [[tx, ty]];
    const adj = {}; Object.keys(NAV).forEach(k => adj[k] = []);
    NAV_EDGES.forEach(e => { if (e.length === 1) { const [a, b] = e[0].split('>'); adj[a].push(b); } else { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); } });
    const near = (px, py, z) => { let best = null, bd = 1e9; for (const k in NAV) { const [nx, ny] = NAV[k]; if (zoneOf(nx, ny) !== z) continue; const d = dist(px, py, nx, ny); if (d < bd) { bd = d; best = k; } } return best; };
    const s = near(x, y, za), g = near(tx, ty, zb);
    if (!s || !g) return [[tx, ty]];
    const prev = { [s]: null }, q = [s];
    while (q.length) { const k = q.shift(); if (k === g) break; for (const n of adj[k]) if (!(n in prev)) { prev[n] = k; q.push(n); } }
    if (!(g in prev)) return [[tx, ty]];
    const path = []; for (let k = g; k; k = prev[k]) path.unshift(NAV[k]);
    path.push([tx, ty]);
    return path;
  }
  // Push a circle (radius 15) out of machines and keep it inside the gym.
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  // Move the staff member one step along the patrol
  function stepStaff(s, dt) {
    if (s.pause > 0) { s.pause -= dt; s.dir += dt * Math.PI * 2 / CFG.staffScan; return; }
    const wp = STAFF_PATH[s.i];
    if (floorOf(wp[0]) !== floorOf(s.x)) { s.x = wp[0]; s.y = wp[1]; s.i = (s.i + 1) % STAFF_PATH.length; return; }
    const dx = wp[0] - s.x, dy = wp[1] - s.y, d = Math.hypot(dx, dy);
    if (d < 3) { if (wp[2] === 'scan') s.pause = CFG.staffScan; s.i = (s.i + 1) % STAFF_PATH.length; return; }
    const st = Math.min(d, CFG.staffSpeed * dt);
    s.x += dx / d * st; s.y += dy / d * st;
    s.dir -= angDiff(s.dir, Math.atan2(dy, dx)) * Math.min(1, dt * 5);
  }
  // Is a point inside the staff vision cone?
  function staffSees(s, x, y) {
    if (floorOf(x) !== floorOf(s.x)) return false;
    const d = dist(s.x, s.y, x, y);
    if (d > CFG.staffSight) return false;
    if (d < 30) return true;
    if (Math.abs(angDiff(Math.atan2(y - s.y, x - s.x), s.dir)) > CFG.staffFov * Math.PI / 360) return false;
    return !WALLS.some(w => (w.t === 'wall' || w.t === 'lockers') && segHitsRect(s.x, s.y, x, y, w));
  }
  // Does the line from (x1,y1) to (x2,y2) pass through a rectangle?
  function segHitsRect(x1, y1, x2, y2, r) {
    let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
    const clip = (p, q) => { if (p === 0) return q >= 0; const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
    return clip(-dx, x1 - r.x) && clip(dx, r.x + r.w - x1) && clip(-dy, y1 - r.y) && clip(dy, r.y + r.h - y1) && t0 <= t1;
  }
  function collide(o) {
    for (const r of SOLIDS) {
      const nx = Math.max(r.x, Math.min(o.x, r.x + r.w)), ny = Math.max(r.y, Math.min(o.y, r.y + r.h));
      const d = dist(o.x, o.y, nx, ny);
      if (d < 15) {
        if (d === 0) o.y = r.y + r.h + 15;
        else { o.x = nx + (o.x - nx) / d * 15; o.y = ny + (o.y - ny) / d * 15; }
      }
    }
    const f = FLOORS[floorOf(o.x)];
    o.x = Math.max(f.x + 15, Math.min(f.x + f.w - 15, o.x));
    o.y = Math.max(72, Math.min(f.y + f.h - 15, o.y));
  }

  Object.assign(out, { CFG, W, H, FLOORS, ZONES, WALLS, STAIRS, NAV, NAV_EDGES, SPAWN, GROUPS, GK, PROGRAMS, MACH, TREADS, DESK, SOLIDS, REST, DOOR, STAFF_PATH, COLOURS, EMOTES, dist, useSpot, inRest, inRect, stairAt, route, zoneOf, floorOf, collide, stepStaff, staffSees, angDiff });
})(typeof module !== 'undefined' ? module.exports : (window.SHARED = {}));
