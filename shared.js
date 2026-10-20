// Shared between the server (Node) and the browser.
// Map layout, rules config and collision live here so both sides agree.
(function (out) {
  // ---- Tuning: every gameplay number lives here ----
  const CFG = {
    roundLength: 180,      // seconds per round
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
    staffSight: 200,
    playerSpeed: 185,
    limpTime: 25,
    programBonus: 300,
    firstBonus: 150,
    strikePenalty: 100,
    pullPenalty: 100,
    lockoutTime: 4         // seconds frozen by a staff lecture
  };

  const W = 1500, H = 920;
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
    ['Flat bench', 'chest', 120, 140, 110, 50, 1],
    ['Incline bench', 'chest', 290, 140, 110, 50, 1.05],
    ['Dumbbell rack', 'arms', 460, 130, 170, 40, 0.95],
    ['Preacher curl', 'arms', 690, 140, 80, 60, 1],
    ['Squat rack 1', 'legs', 880, 110, 90, 90, 1.3],
    ['Squat rack 2', 'legs', 1030, 110, 90, 90, 1.3],
    ['Smith machine', 'shoulders', 1190, 110, 110, 90, 1.15],
    ['Pec deck', 'chest', 120, 420, 90, 70, 0.9],
    ['Shoulder press', 'shoulders', 280, 420, 90, 70, 1],
    ['Lat pulldown', 'back', 440, 420, 90, 70, 1],
    ['Seated row', 'back', 600, 420, 100, 70, 0.95],
    ['Cable stack', 'back', 770, 410, 110, 80, 0.9],
    ['Leg press', 'legs', 960, 420, 110, 80, 1.15],
    ['Leg extension', 'legs', 1130, 420, 90, 70, 1],
    ['Lateral raise', 'shoulders', 1290, 420, 90, 70, 1]
  ].map((a, i) => ({ id: i, name: a[0], g: a[1], x: a[2], y: a[3], w: a[4], h: a[5], spd: a[6] }));
  const TREADS = [0, 1, 2, 3, 4].map(i => ({ x: 120 + i * 110, y: 690, w: 80, h: 120 }));
  const DESK = { x: 1180, y: 800, w: 220, h: 60 };
  const SOLIDS = [...MACH, ...TREADS, DESK];
  const REST = [
    { x: 60, y: 600, r: 52, n: 'Fountain' },
    { x: 1440, y: 560, r: 52, n: 'Fountain' },
    { x: 890, y: 760, r: 92, n: 'Stretch mat' }
  ];
  const DOOR = { x: 1488, y: 700 };
  const STAFF_PATH = [[700, 300], [1440, 300], [1440, 640], [700, 640], [80, 660], [80, 300]];
  const COLOURS = ['#3C82FF', '#E2544B', '#2FBF71', '#FFC93C', '#B07CFF', '#FF7AC8'];
  const EMOTES = ['How many sets left?', 'Mine.', 'Spot me?', 'Lightweight!'];

  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
  const useSpot = m => ({ x: m.x + m.w / 2, y: m.y + m.h + 22 });
  const inRest = (x, y) => REST.some(r => dist(x, y, r.x, r.y) < r.r);
  // Push a circle (radius 15) out of machines and keep it inside the gym.
  function collide(o) {
    for (const r of SOLIDS) {
      const nx = Math.max(r.x, Math.min(o.x, r.x + r.w)), ny = Math.max(r.y, Math.min(o.y, r.y + r.h));
      const d = dist(o.x, o.y, nx, ny);
      if (d < 15) {
        if (d === 0) o.y = r.y + r.h + 15;
        else { o.x = nx + (o.x - nx) / d * 15; o.y = ny + (o.y - ny) / d * 15; }
      }
    }
    o.x = Math.max(15, Math.min(W - 15, o.x));
    o.y = Math.max(72, Math.min(H - 15, o.y));
  }

  Object.assign(out, { CFG, W, H, GROUPS, GK, PROGRAMS, MACH, TREADS, DESK, SOLIDS, REST, DOOR, STAFF_PATH, COLOURS, EMOTES, dist, useSpot, inRest, collide });
})(typeof module !== 'undefined' ? module.exports : (window.SHARED = {}));
