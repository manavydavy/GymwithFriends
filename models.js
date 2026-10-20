// Gym Colonisers: character and machine models (top-down canvas drawings).
// Everything is drawn with plain canvas paths so there are no image files to load.
// GM.machine(m, user) draws a machine with the player posed on it.
// user = null, or { col, fat, skin, hair, L } where L (0..1) is how far through a rep they are.
(function (out) {
  let c = null;
  let SH = false;   // true while drawing a soft shadow pass
  let GC = '#888';  // current muscle group colour (used for bumper plates)

  const STEEL = '#A9B1BE', STEEL_D = '#4E5563', STEEL_L = '#E3E8EF';
  const IRON = '#3A3F49', IRON_L = '#555C68';
  const PAD = '#2A2F3A', PAD_L = '#3D4452';
  const SHORTS = '#2C3140';
  const SKINS = ['#F2C79B', '#DDA877', '#B9825A', '#8C5A3C', '#F5D3B3'];
  const HAIRS = ['#2B1D14', '#5A3A22', '#C9A15A', '#151515', '#7A2E1F', '#D8D8D8'];

  const col = x => (SH ? 'rgba(0,0,0,.22)' : x);
  function shade(hex, f) { // f<0 darker, f>0 lighter
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function heat(f) { const t = Math.min(f, 100) / 100; return 'rgba(255,' + Math.round(205 - 155 * t) + ',' + Math.round(70 - 40 * t) + ',.92)'; }
  function mix(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const ch = (n, s) => (n >> s) & 255, m = s => Math.round(ch(A, s) + (ch(B, s) - ch(A, s)) * t);
    return '#' + ((1 << 24) + (m(16) << 16) + (m(8) << 8) + m(0)).toString(16).slice(1);
  }
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function circ(x, y, r, f) { c.fillStyle = col(f); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  function seg(a, b, w, f, outline) {
    c.lineCap = 'round';
    if (outline !== false) { c.strokeStyle = col(SH ? f : shade(f, -0.35)); c.lineWidth = w + 2; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
    c.strokeStyle = col(f); c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  }
  // Steel tube with a highlight
  function tube(a, b, w) {
    w = w || 4;
    seg(a, b, w, STEEL);
    if (SH) return;
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max(1, w * 0.3); c.lineCap = 'round';
    c.beginPath(); c.moveTo(a[0] - w * 0.15, a[1] - w * 0.15); c.lineTo(b[0] - w * 0.15, b[1] - w * 0.15); c.stroke();
  }
  // Upright post seen from above
  function post(x, y, s) {
    s = s || 8;
    c.fillStyle = col(STEEL_D); rr(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2, 2); c.fill();
    c.fillStyle = col(STEEL); rr(x - s / 2, y - s / 2, s, s, 1.5); c.fill();
    if (SH) return;
    c.fillStyle = STEEL_L; rr(x - s / 2 + 1, y - s / 2 + 1, s * 0.45, s * 0.45, 1); c.fill();
    c.fillStyle = STEEL_D; c.beginPath(); c.arc(x + s * 0.15, y + s * 0.15, s * 0.12, 0, 7); c.fill();
  }
  // Upholstered pad with stitching
  function pad(x, y, w, h, r, f) {
    f = f || PAD;
    c.fillStyle = col('#15181E'); rr(x - 1, y - 1, w + 2, h + 2, r + 1); c.fill();
    c.fillStyle = col(f); rr(x, y, w, h, r); c.fill();
    if (SH) return;
    c.fillStyle = shade(f === PAD ? '#2A2F3A' : f, 0.12); rr(x + 1.5, y + 1.5, w - 3, Math.min(h * 0.4, 7), Math.max(1, r - 1)); c.fill();
    c.setLineDash([2, 2]); c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 1; rr(x + 2.5, y + 2.5, w - 5, h - 5, Math.max(1, r - 2)); c.stroke(); c.setLineDash([]);
  }
  function pulley(x, y, r) { r = r || 4.5; circ(x, y, r + 1, STEEL_D); circ(x, y, r, STEEL); if (!SH) { circ(x, y, r * 0.4, STEEL_D); circ(x - r * 0.35, y - r * 0.35, r * 0.25, STEEL_L); } }
  function cable(a, b) { if (SH) return; c.strokeStyle = '#15171C'; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  // Weight plate seen edge-on (as it sits on a bar)
  function plateEdge(x, y, ang, diam, th, f) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.fillStyle = col(SH ? f : shade(f, -0.4)); rr(-th / 2 - 1, -diam / 2 - 1, th + 2, diam + 2, 2.5); c.fill();
    c.fillStyle = col(f); rr(-th / 2, -diam / 2, th, diam, 2); c.fill();
    if (!SH) { c.fillStyle = 'rgba(255,255,255,.28)'; rr(-th / 2 + 0.8, -diam / 2 + 2, Math.max(1, th * 0.3), diam - 4, 1); c.fill(); }
    c.restore();
  }
  // Barbell. Centre (x,y), angle, half length, scale, plates [[pos, diameter, thickness]]
  function barbell(x, y, ang, half, s, plates, f) {
    f = f || GC;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
    seg([-half + 12, 0], [half - 12, 0], 3, STEEL);
    if (!SH) { c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 3; c.setLineDash([1, 1.5]); c.beginPath(); c.moveTo(-half * 0.45, 0); c.lineTo(-half * 0.1, 0); c.moveTo(half * 0.1, 0); c.lineTo(half * 0.45, 0); c.stroke(); c.setLineDash([]); }
    seg([-half, 0], [-half + 13, 0], 5, STEEL); seg([half - 13, 0], [half, 0], 5, STEEL);
    (plates || []).forEach(([p, d, t]) => { plateEdge(-p, 0, 0, d, t, f); plateEdge(p, 0, 0, d, t, f); });
    c.restore();
  }
  // Hex dumbbell
  function dumbbell(x, y, ang, len, s, f) {
    f = f || IRON;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
    seg([-len / 2, 0], [len / 2, 0], 2.6, STEEL);
    [-1, 1].forEach(k => {
      const hx = k * len / 2;
      c.fillStyle = col('#16181D'); rr(hx - 4.5, -6.5, 9, 13, 2.5); c.fill();
      c.fillStyle = col(f); rr(hx - 3.8, -5.8, 7.6, 11.6, 2); c.fill();
      if (!SH) { c.fillStyle = GC; c.fillRect(hx - 3.8, -1, 7.6, 2); c.fillStyle = 'rgba(255,255,255,.2)'; rr(hx - 3, -5, 2.2, 10, 1); c.fill(); }
    });
    c.restore();
  }
  // Selectorised weight stack seen from above. L lifts the top plates.
  function stack(x, y, w, h, L) {
    c.fillStyle = col('#1B1E24'); rr(x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6, 3); c.fill();
    post(x - w / 2, y - h / 2, 5); post(x + w / 2, y - h / 2, 5); post(x - w / 2, y + h / 2, 5); post(x + w / 2, y + h / 2, 5);
    c.fillStyle = col(IRON); rr(x - w / 2 + 2, y - h / 2 + 2, w - 4, h - 4, 2); c.fill();
    if (SH) return;
    if (L > 0.02) {
      const lift = L * 4, s = 1 + L * 0.08;
      c.fillStyle = 'rgba(0,0,0,.35)'; rr(x - w / 2 + 3 + lift, y - h / 2 + 3 + lift, w - 4, h - 4, 2); c.fill();
      c.save(); c.translate(x, y - lift); c.scale(s, s);
      c.fillStyle = IRON_L; rr(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 2); c.fill();
      c.restore();
    }
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x - w / 2 + 3, y - h / 2 + 3 - L * 4, w - 6, 2);
    c.fillStyle = GC; c.fillRect(x - 3, y - 2 - L * 4, 6, 4);
    circ(x - w / 2 + 6, y - L * 4, 1.6, '#E2544B');
    circ(x, y - h / 2 + 4 - L * 4, 2, STEEL);
  }
  function shadowed(fn, dx, dy) {
    c.save(); c.translate(dx, dy); SH = true; fn(); SH = false; c.restore(); fn();
  }

  // ---------- characters ----------
  function shoe(k, f) {
    const a = Math.atan2(f[1] - k[1], f[0] - k[0]);
    c.save(); c.translate(f[0], f[1]); c.rotate(a);
    c.fillStyle = col('#22252C'); c.beginPath(); c.ellipse(1.5, 0, 6, 4.2, 0, 0, 7); c.fill();
    c.fillStyle = col('#F2F2F2'); c.beginPath(); c.ellipse(1.5, 0, 5, 3.3, 0, 0, 7); c.fill();
    if (!SH) { c.fillStyle = '#C9CED6'; c.fillRect(-1, -0.6, 4, 1.2); }
    c.restore();
  }
  function head(x, y, o) {
    const t = Math.max(0, Math.min(1, ((o.fat || 0) - 40) / 55)), face = t > 0 ? mix(o.skin, '#E8402F', t * 0.9) : o.skin;
    c.save(); c.translate(x, y); c.scale(1 + t * 0.09, 1 + t * 0.09); c.translate(-x, -y);
    circ(x + 1.5, y + 2.2, 9.6, 'rgba(0,0,0,.2)');
    circ(x - 8.7, y + 0.8, 2.6, face); circ(x + 8.7, y + 0.8, 2.6, face);
    circ(x, y, 9, face);
    c.fillStyle = col(o.hair); c.beginPath(); c.arc(x, y + 1.6, 8.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = col(face); c.beginPath(); c.ellipse(x, y - 5.4, 6, 3.4, 0, 0, 7); c.fill();
    if (SH) { c.restore(); return; }
    c.fillStyle = shade(face, -0.15); c.beginPath(); c.ellipse(x, y - 8.7, 1.8, 1.3, 0, 0, 7); c.fill();
    c.strokeStyle = o.band || o.col; c.lineWidth = 2.4; c.beginPath(); c.arc(x, y, 8.6, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = o.band || o.col; c.lineWidth = 1.8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 1, y + 8.6); c.lineTo(x - 3.5, y + 13); c.moveTo(x + 1, y + 8.6); c.lineTo(x + 3, y + 12.5); c.stroke();
    if (o.shades) { c.fillStyle = '#0E0F12'; rr(x - 6.5, y - 8.4, 13, 3.4, 1.6); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x - 5, y - 7.8, 3, 1); }
    if (o.hurt) { c.strokeStyle = '#111'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x - 3.5, y - 6.5); c.lineTo(x - 1.5, y - 4.5); c.moveTo(x - 1.5, y - 6.5); c.lineTo(x - 3.5, y - 4.5); c.moveTo(x + 1.5, y - 6.5); c.lineTo(x + 3.5, y - 4.5); c.moveTo(x + 3.5, y - 6.5); c.lineTo(x + 1.5, y - 4.5); c.stroke(); }
    c.restore();
  }
  function arm(s, h, bend, side, o) {
    const mx = (s[0] + h[0]) / 2, my = (s[1] + h[1]) / 2, dx = h[0] - s[0], dy = h[1] - s[1], L = Math.hypot(dx, dy) || 1;
    const e = [mx + (-dy / L) * side * bend, my + (dx / L) * side * bend];
    seg(s, e, 8.5, o.skin); seg(e, h, 7.2, o.skin);
    c.fillStyle = col(shade(o.skin, -0.35)); c.beginPath(); c.arc(h[0], h[1], 4.6 * (o.hs || 1), 0, 7); c.fill();
    circ(h[0], h[1], 3.8 * (o.hs || 1), o.skin);
  }
  // Person in a local frame where "forward" is -y. part: 'body', 'arms' or both.
  function person(o) {
    c.save(); c.translate(o.x, o.y); c.rotate(o.ang || 0); const s = o.s || 1; c.scale(s, s);
    const shW = o.shW || 14, shY = o.shY == null ? -2 : o.shY, hipY = o.hipY == null ? 9 : o.hipY;
    if (o.part !== 'arms') {
      if (!SH) { c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(2, (shY + hipY) / 2 + 3, shW + 3, (hipY - shY) / 2 + 9, 0, 0, 7); c.fill(); }
      (o.legs || []).forEach(([h, k, f]) => { seg(h, k, 10, SHORTS); seg(k, f, 7.2, o.skin); shoe(k, f); });
      const top = shY - 6, bot = hipY + 5;
      c.fillStyle = col('#15181E'); rr(-shW - 1.2, top - 1.2, shW * 2 + 2.4, bot - top + 2.4, 9); c.fill();
      c.fillStyle = col(o.col); rr(-shW, top, shW * 2, bot - top, 8); c.fill();
      if (!SH && o.fat > 1) {
        c.save(); rr(-shW, top, shW * 2, bot - top, 8); c.clip();
        const hh = (bot - top) * Math.min(o.fat, 100) / 100;
        c.fillStyle = heat(o.fat); c.fillRect(-shW, bot - hh, shW * 2, hh);
        c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(-shW, bot - hh, shW * 2, 1.3);
        c.restore();
      }
      if (!SH) {
        c.fillStyle = 'rgba(255,255,255,.16)'; rr(-shW + 2, top + 2, shW * 2 - 4, 4, 2); c.fill();
        c.fillStyle = o.skin; c.beginPath(); c.ellipse(-shW + 3, shY - 2.5, 3.6, 4.2, 0, 0, 7); c.ellipse(shW - 3, shY - 2.5, 3.6, 4.2, 0, 0, 7); c.fill();
      }
      head(0, o.headY == null ? shY - 3 : o.headY, o);
    }
    if (o.part !== 'body' && o.hands) {
      const b = o.bend == null ? 5 : o.bend;
      arm([-shW + 1, shY], o.hands[0], b, -1, o);
      arm([shW - 1, shY], o.hands[1], b, 1, o);
      if (o.headTop) head(0, o.headY == null ? shY - 3 : o.headY, o);
    }
    c.restore();
  }
  const look = u => ({ col: u.col, fat: u.fat, skin: u.skin, hair: u.hair, band: u.band });

  // Standing/walking person. ph = walk phase, spd 0..1
  function walker(x, y, ang, info, ph, spd, extra) {
    const sw = Math.sin(ph) * Math.min(1, spd), bob = 1 + Math.abs(Math.sin(ph)) * 0.035 * Math.min(1, spd);
    const legs = [[[-6, 6], [-7, -2 + sw * 4], [-8, -10 + sw * 8]], [[6, 6], [7, -2 - sw * 4], [8, -10 - sw * 8]]];
    const hands = extra && extra.hands || [[-17, 3 - sw * 7], [17, 3 + sw * 7]];
    person(Object.assign({ x, y, ang, s: bob, legs, hands, bend: 3 }, look(info), extra || {}));
  }
  // Tumbling after a shove
  function tumble(x, y, spin, info) {
    const legs = [[[-6, 9], [-10, 18], [-12, 27]], [[6, 9], [11, 17], [15, 25]]];
    person(Object.assign({ x, y, ang: spin, legs, hands: [[-22, -12], [22, -8]], bend: 2, hurt: true }, look(info)));
  }

  // ---------- machines (local coords centred on the machine) ----------
  const M = {};
  const seated = (o, y) => Object.assign({ shY: -3, hipY: 8 }, o);

  M.bench = function (w, h, u, incline) {
    tube([-42, -15], [-42, 15], 4); tube([30, -13], [30, 13], 4); tube([-42, 0], [30, 0], 5);
    post(-46, -22, 8); post(-46, 22, 8);
    c.fillStyle = col(STEEL_D); rr(-44, -26, 6, 4, 1); c.fill(); rr(-44, 22, 6, 4, 1); c.fill();
    if (incline) { pad(-48, -10, 50, 20, 7, '#313744'); pad(4, -9, 30, 18, 6); if (!SH) { c.fillStyle = '#15181E'; c.fillRect(2, -8, 2, 16); } }
    else pad(-46, -9, 80, 18, 8);
    const L = u ? u.L : 0, bx = u ? -18 : -45, s = 1 + 0.24 * L;
    const P = u && Object.assign({ x: -6, y: 0, ang: -Math.PI / 2, shY: -12, hipY: 12, headY: incline ? -20 : -23,
      legs: [[[-6, 12], [-15, 21], [-19, 29]], [[6, 12], [15, 21], [19, 29]]] }, look(u));
    if (u) person(Object.assign({ part: 'body' }, P));
    shadowed(() => barbell(bx, 0, Math.PI / 2, 32, s, [[22, 26, 5], [27, 19, 4]]), 3 + 8 * L, 4 + 8 * L);
    if (u) person(Object.assign({ part: 'arms', hands: [[-13, bx + 6], [13, bx + 6]], hs: 1 + 0.25 * L, bend: 7 * (1 - L) + 1 }, P));
  };
  M.incline = (w, h, u) => M.bench(w, h, u, true);

  M.dbrack = function (w, h, u) {
    tube([-82, -14], [82, -14], 4); tube([-82, 4], [82, 4], 4);
    post(-84, -5, 8); post(84, -5, 8);
    for (let i = 0; i < 12; i++) {
      if (u && (i === 6 || i === 7)) continue;
      const sz = 0.72 + (i >> 1) * 0.07;
      dumbbell(-71 + i * 13, -5, Math.PI / 2, 9 + sz * 7, sz);
    }
    if (!SH) { c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '700 6px sans-serif'; c.textAlign = 'center'; for (let i = 0; i < 6; i++) c.fillText(String(5 + i * 5), -64 + i * 26, 13); }
    if (!u) return;
    const L = u.L, P = Object.assign({ x: 0, y: 26, headTop: true, ang: 0, legs: [[[-6, 6], [-7, -2], [-8, -9]], [[6, 6], [7, -2], [8, -9]]] }, look(u));
    person(Object.assign({ part: 'body' }, P));
    const hy = 4 - 15 * L, hx = 17 - 5 * L, s = 1 + 0.3 * L;
    [[-hx, hy], [hx, hy]].forEach(([x, y]) => shadowed(() => dumbbell(x, 26 + y, Math.PI / 2, 12, s), 2 + 5 * L, 3 + 5 * L));
    person(Object.assign({ part: 'arms', hands: [[-hx, hy], [hx, hy]], hs: 1 + 0.25 * L, bend: 5 }, P));
  };

  M.preacher = function (w, h, u) {
    tube([-22, 24], [22, 24], 4); tube([0, 24], [0, -12], 5);
    pad(-14, 8, 28, 18, 6);
    c.fillStyle = col('#15181E'); c.beginPath(); c.moveTo(-26, -5); c.lineTo(26, -5); c.lineTo(19, -25); c.lineTo(-19, -25); c.closePath(); c.fill();
    c.fillStyle = col(PAD); c.beginPath(); c.moveTo(-24, -6); c.lineTo(24, -6); c.lineTo(18, -24); c.lineTo(-18, -24); c.closePath(); c.fill();
    if (!SH) { c.fillStyle = PAD_L; c.beginPath(); c.moveTo(-17, -23); c.lineTo(17, -23); c.lineTo(15, -18); c.lineTo(-15, -18); c.closePath(); c.fill(); }
    post(-24, -2, 5); post(24, -2, 5);
    const L = u ? u.L : 0, s = 1 + 0.32 * L;
    const by = u ? -21 + 16 * L : -2;
    const P = u && Object.assign(seated({ x: 0, y: 16, ang: 0, headTop: true, legs: [[[-6, 8], [-8, -5], [-9, -9]], [[6, 8], [8, -5], [9, -9]]] }), look(u));
    if (u) person(Object.assign({ part: 'body' }, P));
    shadowed(() => {
      c.save(); c.translate(0, by); c.scale(s, s);
      c.strokeStyle = col(STEEL_D); c.lineWidth = 4.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(-26, 0); c.lineTo(-14, 0); c.lineTo(-10, -2.5); c.lineTo(-5, 2.5); c.lineTo(0, -2.5); c.lineTo(5, 2.5); c.lineTo(10, -2.5); c.lineTo(14, 0); c.lineTo(26, 0); c.stroke();
      c.strokeStyle = col(STEEL); c.lineWidth = 2.6; c.stroke();
      plateEdge(-20, 0, 0, 16, 4, GC); plateEdge(20, 0, 0, 16, 4, GC); plateEdge(-24, 0, 0, 11, 3, GC); plateEdge(24, 0, 0, 11, 3, GC);
      c.restore();
    }, 2 + 6 * L, 3 + 6 * L);
    if (u) person(Object.assign({ part: 'arms', hands: [[-9 * s, by - 16], [9 * s, by - 16]], hs: 1 + 0.28 * L, bend: 4 }, P));
  };

  M.squat = function (w, h, u) {
    tube([-38, -38], [-38, 38], 5); tube([38, -38], [38, 38], 5); tube([-38, -38], [38, -38], 5);
    tube([-30, -34], [-30, 34], 3); tube([30, -34], [30, 34], 3);
    [-1, 1].forEach(k => { tube([k * 38, -26], [k * 46, -26], 3); plateEdge(k * 44, -26, Math.PI / 2, 22, 5, GC); plateEdge(k * 49, -26, Math.PI / 2, 22, 5, GC); });
    const L = u ? u.L : 0, s = 1 - 0.17 * L;
    let P;
    if (u) {
      P = Object.assign({ x: 0, y: 8, ang: 0, s, shY: -2, hipY: 9 + 4 * L,
        legs: [[[-7, 8], [-10 - 3 * L, -5 - 10 * L], [-10, -12]], [[7, 8], [10 + 3 * L, -5 - 10 * L], [10, -12]]] }, look(u));
      person(Object.assign({ part: 'body' }, P));
    }
    const by = u ? 8 - 1 * s : -30;
    shadowed(() => barbell(0, by, 0, 46, u ? s : 1, [[31, 32, 6], [37, 24, 5]]), u ? 2 + 3 * (1 - L) : 2, u ? 3 + 4 * (1 - L) : 3);
    if (u) person(Object.assign({ part: 'arms', hands: [[-20, 0], [20, 0]], hs: 1, bend: -5 }, P));
    else { c.fillStyle = col(STEEL_D); rr(-41, -33, 6, 6, 1); c.fill(); rr(35, -33, 6, 6, 1); c.fill(); }
    post(-38, -38, 10); post(38, -38, 10); post(-38, 38, 10); post(38, 38, 10);
    tube([-38, 38], [38, 38], 3.5);
  };

  M.smith = function (w, h, u) {
    tube([-50, -40], [-50, 40], 5); tube([50, -40], [50, 40], 5); tube([-50, -40], [50, -40], 5);
    pad(-12, -2, 24, 18, 6, '#313744'); pad(-12, 18, 24, 20, 6);
    const L = u ? u.L : 0, s = 1 + 0.3 * L;
    const P = u && Object.assign(seated({ x: 0, y: 18, ang: 0, legs: [[[-6, 8], [-10, -9], [-11, -15]], [[6, 8], [10, -9], [11, -15]]] }), look(u));
    if (u) person(Object.assign({ part: 'body' }, P));
    shadowed(() => {
      barbell(0, 6, 0, 52, s, [[38, 30, 6], [44, 22, 5]]);
      c.save(); c.translate(0, 6); c.scale(s, s); c.fillStyle = col(STEEL_D); rr(-31, -4, 5, 8, 1); c.fill(); rr(26, -4, 5, 8, 1); c.fill(); c.restore();
    }, 2 + 8 * L, 3 + 8 * L);
    if (u) person(Object.assign({ part: 'arms', hands: [[-19 * s, -12 - 2 * L], [19 * s, -12 - 2 * L]], hs: 1 + 0.28 * L, bend: 8 * (1 - L) + 2 }, P));
    [-1, 1].forEach(k => { circ(k * 30, 6, 3.6, STEEL_D); circ(k * 30, 6, 2.6, STEEL_L); });
    post(-50, -40, 9); post(50, -40, 9); post(-50, 40, 9); post(50, 40, 9);
  };

  function seatUnit(withBack) {
    tube([-18, -22], [-18, 20], 4); tube([18, -22], [18, 20], 4);
    if (withBack !== false) pad(-15, -18, 30, 10, 4, '#313744');
    pad(-15, -7, 30, 20, 6);
  }
  M.pec = function (w, h, u) {
    const L = u ? u.L : 0;
    stack(0, -27, 30, 12, L);
    seatUnit();
    const px = 32 - 25 * L, py = 0 + 16 * L - Math.sin(Math.PI * L) * 3;
    const P = u && Object.assign(seated({ x: 0, y: -4, ang: Math.PI, legs: [[[-6, 8], [-8, -10], [-9, -20]], [[6, 8], [8, -10], [9, -20]]] }), look(u));
    if (u) person(Object.assign({ part: 'body' }, P));
    [-1, 1].forEach(k => {
      const pv = [k * 22, -14], pd = [k * px, py];
      tube(pv, pd, 3.5); post(pv[0], pv[1], 6);
      const a = Math.atan2(pd[1] - pv[1], pd[0] - pv[0]);
      c.save(); c.translate(pd[0], pd[1]); c.rotate(a + Math.PI / 2); pad(-4, -10, 8, 20, 3); c.restore();
    });
    if (u) person(Object.assign({ part: 'arms', hands: [[-px, -(py + 4)], [px, -(py + 4)]], bend: 4 }, P));
    else cable([0, -21], [0, -14]);
  };
  M.shoulder = function (w, h, u) {
    const L = u ? u.L : 0, s = 1 + 0.3 * L;
    stack(0, -27, 30, 12, L);
    seatUnit();
    const hx = 21 - 4 * L, hy = -3 - 3 * L;
    const P = u && Object.assign(seated({ x: 0, y: -4, ang: Math.PI, legs: [[[-6, 8], [-8, -10], [-9, -20]], [[6, 8], [8, -10], [9, -20]]] }), look(u));
    if (u) person(Object.assign({ part: 'body' }, P));
    [-1, 1].forEach(k => {
      tube([k * 24, -22], [k * hx, hy], 3.5);
      shadowed(() => { c.save(); c.translate(k * hx, hy); c.scale(s, s); c.fillStyle = col('#1D2027'); rr(-3, -6, 6, 12, 2.5); c.fill(); c.restore(); }, 2 + 6 * L, 3 + 6 * L);
    });
    if (u) person(Object.assign({ part: 'arms', hands: [[-hx, -(hy + 4)], [hx, -(hy + 4)]], hs: 1 + 0.28 * L, bend: 7 * (1 - L) + 2 }, P));
  };
  M.latraise = function (w, h, u) {
    const L = u ? u.L : 0, s = 1 + 0.2 * L;
    stack(0, -27, 30, 12, L);
    seatUnit();
    const px = 20 + 16 * L, py = 2 - 8 * L;
    const P = u && Object.assign(seated({ x: 0, y: -6, ang: Math.PI, legs: [[[-6, 8], [-8, -10], [-9, -20]], [[6, 8], [8, -10], [9, -20]]] }), look(u));
    if (u) person(Object.assign({ part: 'body' }, P));
    [-1, 1].forEach(k => {
      const pv = [k * 12, -12], pd = [k * px, py];
      tube(pv, pd, 3.5); post(pv[0], pv[1], 6);
      const a = Math.atan2(pd[1] - pv[1], pd[0] - pv[0]);
      shadowed(() => { c.save(); c.translate(pd[0], pd[1]); c.rotate(a); c.scale(s, s); pad(-8, -4, 14, 8, 3); c.restore(); }, 2 + 5 * L, 3 + 5 * L);
    });
    if (u) person(Object.assign({ part: 'arms', hands: [[-(px + 4), -(py + 6)], [px + 4, -(py + 6)]], bend: 2 }, P));
  };
  M.latpull = function (w, h, u) {
    const L = u ? u.L : 0;
    stack(0, -26, 30, 12, 1 - L > 0.98 && !u ? 0 : L);
    tube([-16, -20], [-16, 30], 4); tube([16, -20], [16, 30], 4);
    pad(-13, 12, 26, 18, 6);
    const P = u && Object.assign(seated({ x: 0, y: 18, ang: 0, legs: [[[-6, 8], [-9, -8], [-10, -12]], [[6, 8], [9, -8], [10, -12]]] }), look(u));
    if (u) person(Object.assign({ part: 'body' }, P));
    c.fillStyle = col('#1D2027'); rr(-18, 3, 36, 8, 4); c.fill();
    if (!SH) { c.fillStyle = '#2E333D'; rr(-17, 4, 34, 3, 1.5); c.fill(); }
    const by = u ? -6 + 18 * L : -6, s = u ? 1.25 - 0.25 * L : 1.2;
    cable([0, -14], [0, by]);
    shadowed(() => {
      c.save(); c.translate(0, by); c.scale(s, s);
      c.strokeStyle = col(STEEL_D); c.lineWidth = 4.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(-34, 4); c.lineTo(-26, 0); c.lineTo(26, 0); c.lineTo(34, 4); c.stroke();
      c.strokeStyle = col(STEEL); c.lineWidth = 2.6; c.stroke();
      c.fillStyle = col('#1D2027'); rr(-35, 1, 8, 5, 2); c.fill(); rr(27, 1, 8, 5, 2); c.fill();
      c.restore();
    }, 2 + 6 * (1 - L), 3 + 6 * (1 - L));
    if (u) person(Object.assign({ part: 'arms', hands: [[-27 * s, by - 18 + 2], [27 * s, by - 18 + 2]], hs: 1 + 0.2 * (1 - L), bend: 3 + 8 * L }, P));
    tube([0, -20], [0, -10], 5); pulley(0, -12, 4);
  };
  M.row = function (w, h, u) {
    const L = u ? u.L : 0;
    stack(0, -27, 30, 12, L);
    tube([0, -20], [0, 32], 6);
    c.fillStyle = col('#1D2027'); rr(-16, -18, 32, 8, 2); c.fill();
    if (!SH) { c.fillStyle = '#3A404C'; for (let i = 0; i < 5; i++) c.fillRect(-14 + i * 6.5, -16, 3, 4); }
    pad(-11, 10, 22, 16, 5);
    pulley(0, -19, 3.5);
    const lean = (1 - L) * 5;
    const P = u && Object.assign({ x: 0, y: 18, ang: 0, headTop: true, shY: -3 - lean, hipY: 8, headY: -6 - lean * 1.3,
      legs: [[[-6, 8], [-10, -12], [-8, -32]], [[6, 8], [10, -12], [8, -32]]] }, look(u));
    if (u) person(Object.assign({ part: 'body' }, P));
    const hy = u ? -6 + 18 * L : -12;
    cable([0, -19], [0, hy]);
    shadowed(() => { c.strokeStyle = col(STEEL); c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-6, hy + 3); c.lineTo(0, hy - 2); c.lineTo(6, hy + 3); c.stroke(); c.fillStyle = col('#1D2027'); rr(-8, hy + 1, 5, 5, 2); c.fill(); rr(3, hy + 1, 5, 5, 2); c.fill(); }, 2, 3);
    if (u) person(Object.assign({ part: 'arms', hands: [[-5, hy - 18 + 3], [5, hy - 18 + 3]], bend: 3 + 9 * L }, P));
  };
  M.cable = function (w, h, u) {
    const L = u ? u.L : 0;
    [-1, 1].forEach(k => {
      c.fillStyle = col('#1B1E24'); rr(k * 46 - 10, -36, 20, 58, 4); c.fill();
      stack(k * 46, -10, 12, 30, L);
      tube([k * 46, -30], [k * 38, -6], 3); pulley(k * 37, -6, 4);
    });
    tube([-46, -36], [46, -36], 4);
    const hx = 30 - 13 * L, hy = -6 + 18 * L;
    const P = u && Object.assign({ x: 0, y: 14, ang: 0, headTop: true, legs: [[[-7, 6], [-9, -2], [-11, -9]], [[7, 6], [9, -2], [11, -9]]] }, look(u));
    if (u) person(Object.assign({ part: 'body' }, P));
    if (u) {
      [-1, 1].forEach(k => cable([k * 37, -6], [k * hx, hy]));
      [-1, 1].forEach(k => { c.fillStyle = col('#1D2027'); c.beginPath(); c.arc(k * hx, hy, 3.5, 0, 7); c.fill(); });
      person(Object.assign({ part: 'arms', hands: [[-hx, hy - 14], [hx, hy - 14]], bend: -(3 + 10 * L) }, P));
    } else [-1, 1].forEach(k => { c.fillStyle = col('#1D2027'); c.beginPath(); c.arc(k * 34, -2, 3.5, 0, 7); c.fill(); });
  };
  M.legpress = function (w, h, u) {
    const L = u ? u.L : 0;
    tube([-50, -26], [-50, 26], 4); tube([-50, -26], [52, -26], 4); tube([-50, 26], [52, 26], 4);
    tube([-8, -18], [52, -18], 4); tube([-8, 18], [52, 18], 4);
    pad(-52, -14, 24, 28, 8, '#313744'); pad(-30, -12, 18, 24, 6);
    [-1, 1].forEach(k => { c.fillStyle = col('#1D2027'); rr(-34, k * 17 - 3, 10, 6, 3); c.fill(); });
    const sx = 4 + 22 * L;
    c.fillStyle = col(STEEL_D); rr(sx - 1, -23, 14, 46, 3); c.fill();
    c.fillStyle = col(STEEL); rr(sx, -22, 12, 44, 2.5); c.fill();
    pad(sx - 4, -19, 7, 38, 2);
    [-1, 1].forEach(k => { tube([sx + 9, k * 22], [sx + 9, k * 34], 3); plateEdge(sx + 9, k * 28, Math.PI / 2, 24, 5, GC); plateEdge(sx + 9, k * 33, Math.PI / 2, 18, 4, GC); });
    if (!u) return;
    const toL = (x, y) => [-(y), x + 32];
    const legs = [-1, 1].map(k => {
      const hip = [-22, k * 6], foot = [sx - 5, k * 8];
      const knee = [(-8) * (1 - L) + ((hip[0] + foot[0]) / 2) * L, k * (15 - 4 * L)];
      return [toL(...hip), toL(...knee), toL(...foot)];
    });
    const P = Object.assign({ x: -32, y: 0, ang: -Math.PI / 2, shY: -10, hipY: 10, headY: -18, legs }, look(u));
    person(P);
    person(Object.assign({ part: 'arms', hands: [toL(-29, 17), toL(-29, -17)], bend: 3 }, P));
  };
  M.legext = function (w, h, u) {
    const L = u ? u.L : 0;
    stack(-36, -22, 14, 18, L);
    cable([-36, -12], [-19, 4]);
    seatUnit();
    [-1, 1].forEach(k => { c.fillStyle = col('#1D2027'); rr(k * 20 - 3, -9, 6, 10, 3); c.fill(); });
    const ry = 15 + 14 * L, rs = 1 + 0.25 * L;
    const P = u && Object.assign(seated({ x: 0, y: -12, ang: Math.PI,
      legs: [[[-6, 8], [-7, -18], [-7, -(ry + 12) + 2]], [[6, 8], [7, -18], [7, -(ry + 12) + 2]]] }), look(u));
    if (u) person(Object.assign({ part: 'body' }, P));
    [-1, 1].forEach(k => { tube([k * 19, 4], [k * 16, ry], 3.5); post(k * 19, 4, 6); });
    shadowed(() => { c.save(); c.translate(0, ry); c.scale(rs, rs); c.fillStyle = col('#16181D'); rr(-16, -5, 32, 10, 5); c.fill(); c.fillStyle = col(PAD); rr(-15, -4, 30, 8, 4); c.fill(); if (!SH) { c.fillStyle = PAD_L; rr(-14, -3.5, 28, 2.5, 1.2); c.fill(); } c.restore(); }, 2 + 6 * L, 3 + 6 * L);
    if (u) person(Object.assign({ part: 'arms', hands: [[-20, -4], [20, -4]], bend: 3 }, P));
  };

  const TYPE = {
    'Flat bench': 'bench', 'Incline bench': 'incline', 'Dumbbell rack': 'dbrack', 'Preacher curl': 'preacher',
    'Squat rack 1': 'squat', 'Squat rack 2': 'squat', 'Smith machine': 'smith', 'Pec deck': 'pec',
    'Shoulder press': 'shoulder', 'Lat pulldown': 'latpull', 'Seated row': 'row', 'Cable stack': 'cable',
    'Leg press': 'legpress', 'Leg extension': 'legext', 'Lateral raise': 'latraise'
  };

  out.GM = {
    ctx(ctx) { c = ctx; },
    skin: id => SKINS[id % SKINS.length],
    hair: id => HAIRS[(id * 7 + 3) % HAIRS.length],
    // Machine footprint + model + the person using it
    machine(m, user, groupCol, jitter) {
      GC = groupCol;
      c.save(); c.translate(m.x + m.w / 2 + (jitter || 0), m.y + m.h / 2);
      (M[TYPE[m.name]] || M.bench)(m.w, m.h, user);
      c.restore();
    },
    walker, tumble, person,
    gaz(x, y) {
      person({ x, y, ang: Math.PI, s: 1.2, shW: 17, col: '#1A1A1A', band: '#E2544B', skin: '#DDA877', hair: '#151515', shades: true, headTop: true, headY: 2,
        legs: [], hands: [[9, 4], [-9, 4]], bend: -6 });
    }
  };
})(window);
